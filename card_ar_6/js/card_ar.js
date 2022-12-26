class CardAR {
	constructor(video, update){
		const scale = Math.min(video.videoWidth, video.videoHeight) / 100;
		this.video = video;
		this.options = [];
		this.brightness = 1;
		this.allowOcrPersistance = false;
		this.alive = true;
		this.paused = false;
		let isPending = false;
		let newBoxes = true;
		let boxes = [];
		let booleanArray = null;
		let card = null;
		let avgColor = null;
		let rotation = null;
		let rawOcrOutput = null;
		let ocrOutput = null;
		let lastBoxUpdate = performance.now();
		let lastOcrUpdate = performance.now();
		Object.defineProperties(this, Object.getOwnPropertyDescriptors({
			get isPending(){
				return isPending;
			},
			get boxes(){
				return boxes;
			},
			get booleanArray(){
				return booleanArray;
			},
			get sobel(){
				if ( booleanArray === null ) {
					return null;
				}
				const {length} = booleanArray;
				const ret = new Uint8ClampedArray(4 * length);
				for ( let i = 0, l = 4 * length; i < l; i++ ) {
					ret[i] = i % 4 === 3 ? 255 : 255 * booleanArray[Math.floor(0.25 * i)];
				}
				return new ImageData(ret, Math.floor(this.video.videoWidth / scale));
			},
			get sobelCanvas(){
				const {sobel} = this;
				const canvas = document.createElement("canvas");
				canvas.width = sobel.width;
				canvas.height = sobel.height;
				const ctx = canvas.getContext("2d");
				ctx.putImageData(sobel, 0, 0);
				return canvas;
			},
			get rotation(){
				return rotation;
			},
			get rawOcrOutput(){
				return rawOcrOutput;
			},
			get ocrOutput(){
				return ocrOutput;
			},
			get card(){
				return card;
			},
			get avgColor(){
				return avgColor;
			},
			get status(){
				if ( card === null ) {
					return null;
				} else {
					return {
						text: isPending ? CardAR.TEXT_PENDING : ocrOutput.selected,
						rect: card,
						rotation
					};
				}
			}
		}));
		//sffa Boxing Loop
		(async () => {
			const sffaCanvas = document.createElement("canvas");
			const sffaCtx = sffaCanvas.getContext("2d");
			let sffaWorker;
			{
				sffaWorker = new Worker("js/workers/sffa.js");
				sffaWorker.onmessage = ({data}) => {
					booleanArray = data.booleanArray;
					newBoxes = true;
					boxes = data.boxes.map(rect => rect.map(x => scale * x));
					let array;
					{
						array = boxes.filter(rect => {
							const [x, y, width, height] = rect;
							const {videoWidth, videoHeight} = this.video;
							return width * height < videoWidth * videoHeight * (1 / 4)
								&& width * height > videoWidth * videoHeight * (1 / 64)
								&& width < 3 * height
								&& height < 3 * width
								&& x > 10
								&& y > 10
								&& videoWidth - x - width > 10
								&& videoHeight - y - height > 10;
						}).slice(0, 10).map(rect => {
							const [x, y, width, height] = rect;
							const tempCanvas = document.createElement("canvas");
							tempCanvas.width = width;
							tempCanvas.height = height;
							const ctx = tempCanvas.getContext("2d");
							ctx.filter = `brightness(${100 * this.brightness}%)`;
							ctx.drawImage(video, -x, -y);
							let avgColor = [0, 0, 0];
							const imageData = ctx.getImageData(0, 0, width, height);
							for ( let i = 0; i < 4 * width * height; i++ ) {
								const index = i % 4;
								if ( index === 3 ) {
									continue;
								}
								avgColor[index] += imageData.data[i];
							}
							avgColor = avgColor.map(sp => Math.floor(sp / (width * height)));
							const distanceFromWhite = Math.sqrt(
								Math.pow(avgColor[0] - 255, 2)
								+ Math.pow(avgColor[1] - 255, 2)
								+ Math.pow(avgColor[2] - 255, 2)
							) / Math.sqrt(3 * Math.pow(255, 2));
							return {
								score: distanceFromWhite,
								avgColor,
								rect
							};
						});
						array = array.filter(item => item.score < 0.5);
						array.sort((a, b) => b.rect[2] * b.rect[3] - a.rect[2] * a.rect[3]);
					}
					{
						lastBoxUpdate = performance.now();
						card = array[0] || null;
						if ( card !== null ) {
							if ( card.score > 0.5 ) {
								card = null;
							} else {
								avgColor = card.avgColor;
								card = card.rect;
							}
						}
					}
				};
			}
			while ( this.alive ) {
				await new Promise(resolve => {
					requestAnimationFrame(resolve);
				});
				if ( this.paused || newBoxes === false ) {
					continue;
				}
				newBoxes = false;
				const {video} = this;
				const width = Math.floor(sffaCanvas.width = video.videoWidth / scale);
				const height = Math.floor(sffaCanvas.height = video.videoHeight / scale);
				sffaCtx.filter = `brightness(${100 * this.brightness}%)`;
				sffaCtx.drawImage(video, 0, 0, width, height);
				const {data} = sffaCtx.getImageData(0, 0, width, height);
				sffaWorker.postMessage({
					width,
					height,
					data
				});
			}
		})();
		//rect rotation loop
		(async () => {
			const rectRotationCanvas = document.createElement("canvas");
			const rectRotationCtx = rectRotationCanvas.getContext("2d");
			let offsetX;
			let offsetY;
			let newRotation = true;
			let rectRotationWorker;
			{
				rectRotationWorker = new Worker("js/workers/rect_rotation.js");
				rectRotationWorker.onmessage = ({data}) => {
					newRotation = true;
					data.area *= Math.pow(scale, 2);
					const loop = obj => {
						for ( let key in obj ) {
							const value = obj[key];
							if ( value instanceof Uint32Array ) {
								value[0] += offsetX;
								value[1] += offsetY;
								for ( let i = 0, l = value.length; i < l; i++ ) {
									value[i] = scale * value[i];
								}
							} else if ( value instanceof Object ) {
								loop(value);
							}
						}
					};
					if ( card !== null && card[2] * card[3] < data.area ) {
						rotation = null;
					} else {
						loop(rotation = data);
					}
				};
			}
			while ( this.alive ) {
				await new Promise(resolve => {
					requestAnimationFrame(resolve);
				});
				if ( this.paused || this.card === null ) {
					continue;
				}
				if ( newRotation === false ) {
					continue;
				}
				newRotation = false;
				const {video} = this;
				const {videoWidth, videoHeight} = video;
				const [x, y, width, height] = (() => {
					const [x, y, width, height] = card;
					const margin = 0.25 * 0.5 * (width + height);
					const margin2 = 2 * margin;
					return [
						x - margin,
						y - margin,
						width + margin2,
						height + margin2
					].map(n => Math.floor(n / scale));
				})();
				offsetX = x;
				offsetY = y;
				rectRotationCanvas.width = width;
				rectRotationCanvas.height = height;
				rectRotationCtx.drawImage(video, -x, -y, videoWidth / scale, videoHeight / scale);
				const {data} = rectRotationCtx.getImageData(0, 0, width, height);
				rectRotationWorker.postMessage({
					data,
					width,
					startX: Math.floor(0.5 * width),
					startY: Math.floor(0.5 * height),
					scale,
					threshold: 0.25
				});
			}
		})();
		//OCR loop
		(async () => {
			const cardCanvas = document.createElement("canvas");
			const cardCtx = cardCanvas.getContext("2d");
			const workAsync = (() => {
				const ocrWorker = Tesseract.createWorker();
				Tesseract.setLogging(false);
				return async canvas => {
					await ocrWorker.load();
					await ocrWorker.loadLanguage("eng");
					await ocrWorker.initialize("eng");
					return await ocrWorker.recognize(canvas);
				};
			})();
			while ( this.alive ) {
				await new Promise(resolve => {
					requestAnimationFrame(resolve);
				});
				if ( this.paused || card === null ) {
					continue;
				}
				const {video, options} = this;
				{
					const [x, y, width, height] = card;
					cardCanvas.width = width;
					cardCanvas.height = height;
					cardCtx.drawImage(video, -x, -y);
				}
				{
					const {data: {words}} = rawOcrOutput = await workAsync(cardCanvas);
					words.sort((a, b) => b.confidence - a.confidence);
					for ( let {text, confidence} of words ) {
						//get rid of any accents in the text
						text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^A-z]/g, "");
						const simularities = options.map(key => {
							return {
								key,
								score: getSimularity(key, text)
							};
						}).filter(item => item.score > 0).sort((a, b) => b.score - a.score);;
						const best = simularities[0];
						if ( best ) {
							lastOcrUpdate = performance.now();
							ocrOutput = {
								selected: best.key,
								relevance: best.score,
								confidence: 0.01 * confidence
							};
							break;
						}
					}
				}
			}
		})();
		//update loop (can potentially be used as a render loop by dependent scripts)
		(async () => {
			let lastUpdateHadCard = false;
			let lastCardDiscovery = performance.now();
			while ( this.alive ) {
				await new Promise(resolve => {
					requestAnimationFrame(resolve);
				});
				if ( this.paused ) {
					continue;
				}
				const hasCard = card !== null;
				if ( lastUpdateHadCard === false && hasCard ) {
					lastCardDiscovery = lastBoxUpdate;
				}
				isPending = this.allowOcrPersistance ? ocrOutput === null : card !== null && lastCardDiscovery > lastOcrUpdate/* && (ocrOutput === null || performance.now() - lastCardLeave > 1000)*/;
				//pending is true if the card has been detected by SFFA,
				//but a result has not been returned by the OCR yet
				lastUpdateHadCard = hasCard;
				update(this);
			}
		})();
	}
	static loadImageAsync(src){
		return new Promise(resolve => {
			const image = new Image;
			const load = () => {
				resolve(image);
				image.removeEventListener("load", load);
			};
			image.addEventListener("load", load);
			image.src = src;
		});
	}
	static loadVideoAsync(src){
		return new Promise(resolve => {
			const video = document.createElement("video");
			video.addEventListener("loadedmetadata", () => {
				video.play();
				resolve(video);
			}, {
				once: true
			});
			video.muted = true;
			video.loop = true;
			video.src = src;
		});
	}
	renderBoxes(ctx, boxes){
		ctx.save();
		for ( let box of boxes ) {
			ctx.strokeStyle = "#0ff";
			ctx.strokeRect(...box);
		}
		ctx.restore();
	}
	renderCard(ctx, img, status, allowRotation = true, showBounds = true){
		const {canvas} = ctx;
		const {rotation} = status;
		if ( rotation === null || allowRotation === false ) {
			ctx.drawImage(img, ...status.rect.slice(0, 4));
		} else {
			const getFlippedByMultipleOf90 = (input, factor) => {
				const {width, height} = input;
				const canvas = document.createElement("canvas");
				canvas.width = factor % 2 === 0 ? width : height;
				canvas.height = factor % 2 === 0 ? height : width;
				const ctx = canvas.getContext("2d");
				ctx.save();
				ctx.translate(0.5 * canvas.width, 0.5 * canvas.height);
				ctx.rotate(factor * Math.PI / 2);
				ctx.drawImage(input, -0.5 * width, -0.5 * height);
				ctx.restore();
				return canvas;
			};
			if ( rotation.isPerfect ) {
				const [x, y, width, height] = rotation.rect;
				if ( img.width !== img.height && (img.width < img.height !== width < height) ) {
					img = getFlippedByMultipleOf90(img, -1);
				}
				ctx.drawImage(img, ...rotation.rect);
			} else {
				const {points} = rotation;
				const getDistance = (aDirection, bDirection) => {
					const a = points[aDirection];
					const b = points[bDirection];
					return Math.sqrt(
						Math.pow(a[0] - b[0], 2)
						+ Math.pow(a[1] - b[1], 2)
					);
				};
				const width = getDistance("south", "west");
				const height = getDistance("south", "east");
				if ( img.width !== img.height && (img.width < img.height !== width < height) ) {
					if ( rotation.bottomPoint2 === "east" ) {
						//flip image -90deg clockwise
						img = getFlippedByMultipleOf90(img, -1);
					} else {
						//flip image 90deg counterclockwise
						if ( img.width > img.height ) {
							img = getFlippedByMultipleOf90(img, 1);
						} else {
							img = getFlippedByMultipleOf90(img, -1);
						}
					}
				}
				ctx.save();
				ctx.translate(...rotation.center);
				ctx.rotate(rotation.angle);
				ctx.drawImage(img, -0.5 * width, -0.5 * height, width, height);
				ctx.restore();
			}
			if ( showBounds ) {
				ctx.save();
				const {rect} = rotation;
				ctx.strokeStyle = "#0ff";
				ctx.lineWidth = 5;
				ctx.strokeRect(...rect);
				const {points} = rotation;
				for ( let direction in points ) {
					const [x, y] = points[direction];
					const size = 10;
					ctx.fillStyle = "#f00";
					ctx.fillRect(x - 0.5 * size, y - 0.5 * size, size, size);
				}
				ctx.restore();
			}
		}
	}
};
CardAR.TEXT_PENDING = Symbol("CardAR Pending");