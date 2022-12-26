//Lumes is a library I originally created for an image editing application so this file has some un-used functionality.
//However, in this project it is used maily for Sobel image convolution.
const Lumes = (() => {
	//canvas functions will not be avalible in web workers
	const isDoc = "document" in self;
	const limitNumber = (n, min, max) => Math.max(Math.min(n, max), min);
	//dynamic
	class Lumes {
		constructor(des = new ImageData(10, 10), dataWidth){
			this.setImage(des, dataWidth);
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
		static openFileAsync(){
			return new Promise(resolve => {
				const input = document.createElement("input");
				input.onclick = e => {
					e.stopPropagation();
				};
				input.onchange = () => {
					const file = input.files[0];
					if ( file ) {
						const objectURL = URL.createObjectURL(file);
						const img = new Image();
						img.onload = () => {
							resolve({
								image: img,
								name: file.name
							});
							URL.revokeObjectURL(objectURL);
						};
						img.src = objectURL;
					} else {
						resolve(null);
					}
				};
				input.type = "file";
				document.body.appendChild(input);
				input.click();
				document.body.removeChild(input);
			});
		}
		setImage(des, dataWidth){
			//dataWidth is only needed if des is a typed array
			if ( typeof des === "number" ) {
				des = new ImageData(des, dataWidth);
			} else if ( des instanceof Lumes ) {
				if ( isDoc ) {
					des = des.canvas;
				} else {
					des = des.imageData;
				}
			}
			if ( isDoc ) {
				const canvas = document.createElement("canvas");
				let {width, height} = des;
				if ( des instanceof Uint8ClampedArray ) {
					des = new ImageData(new Uint8ClampedArray(des), width = desWidth);
				}
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext("2d");
				ctx.imageSmoothingEnabled = false;
				if ( des instanceof ImageData ) {
					ctx.putImageData(des, 0, 0);
				} else {
					ctx.drawImage(des, 0, 0);
				}
				//save canvas for native code acceleration
				this.canvas = canvas;
				this.ctx = ctx;
				this.imageData = ctx.getImageData(0, 0, width, height);
				this.width = width;
				this.height = height;
			} else {
				let width;
				let data;
				if ( des instanceof ImageData ) {
					({width, data} = des);
				} else {
					data = des;
					width = dataWidth;
				}
				const imageData = this.imageData = new ImageData(new Uint8ClampedArray(data), width);
				this.width = width;
				this.height = imageData.height;
			}
		}
		toCanvas(){
			const {canvas} = this;
			const newCanvas = document.createElement("canvas");
			newCanvas.width = canvas.width;
			newCanvas.height = canvas.height;
			const ctx = newCanvas.getContext("2d");
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(canvas, 0, 0);
			return newCanvas;
		}
		async toBlobAsync(mime = "image/png"){
			return await new Promise(resolve => {
				const {canvas} = this;
				if ( "toBlob" in canvas ) {
					canvas.toBlob(blob => {
						resolve(blob);
					}, mime);
				} else {
					const url = canvas.toDataURL(mime);
					fetch(url).then(res => res.blob()).then(blob => {
						resolve(blob);
					});
				}
			});
		}
		async toImageAsync(revoke = true){
			const blob = await this.toBlobAsync();
			const src = URL.createObjectURL(blob);
			const ret = await Lumes.loadImageAsync(src);
			if ( revoke ) {
				URL.revokeObjectURL(src);
			}
			return ret;
		}
		edit(fn){
			const {imageData} = this;
			this.setImage(fn(imageData, imageData.data.length) || imageData);
			return this;
		}
		editNative(fn){
			if ( isDoc ) {
				const {canvas, ctx} = this;
				this.setImage(fn({
					canvas: canvas,
					ctx
				}) || canvas);
				return this;
			} else {
				return false;
			}
		}
		convolute(weights, opacity = false, isGrayscale = false){
			//optimizations can be performed on grayscale image convolutions
			weights = new Float32Array(weights);
			const {width, height, data} = this.imageData;
			const side = Math.round(Math.sqrt(weights.length));
			const halfSide = Math.floor(0.5 * side);
			const output = new ImageData(width, height);
			const newData = output.data;
			const alphaFactor = opacity ? 1 : 0;
			for ( let sx = 0; sx < width; sx++ ) {
				for ( let sy = 0; sy < height; sy++ ) {
					const newDataOffset = 4 * (sy * width + sx);
					const rgba = new Float32Array(isGrayscale ? 2 : 4);
					for ( let cx = 0; cx < side; cx++ ) {
						for ( let cy = 0; cy < side; cy++ ) {
							const scx = limitNumber(sx + cx - halfSide, 0, width - 1);
							const scy = limitNumber(sy + cy - halfSide, 0, height - 1);
							const dataOffset = 4 * (scy * width + scx);
							const wt = weights[cy * side + cx];
							if ( isGrayscale ) {
								rgba[0] += wt * data[dataOffset];
								rgba[1] += wt * data[dataOffset + 3];
							} else {
								for ( let sp = 0; sp < 4; sp++ ) {
									rgba[sp] += wt * data[dataOffset + sp];
								}
							}
						}
					}
					for ( let sp = 0; sp < 3; sp++ ) {
						newData[newDataOffset + sp] = Math.abs(rgba[isGrayscale ? 0 : sp]);
					}
					const alpha = rgba[isGrayscale ? 1 : 3];
					newData[newDataOffset + 3] = alpha + alphaFactor * (255 - alpha);
				}
			}
			this.setImage(output);
			return this;
		}
		matchAt(offsetX, offsetY, matchImageData){
			const {data, width, height} = this.imageData;
			const matchData = matchImageData.data;
			const matchWidth = matchImageData.width;
			const matchHeight = matchImageData.height;
			let grandTotal = 0;
			for ( let x = 0; x < matchWidth; x++ ) {
				for ( let y = 0; y < matchHeight; y++ ) {
					for ( let sp = 0; sp < 3; sp++ ) {
						grandTotal += 255 - Math.abs(data[4 * (width * (offsetY + y) + (offsetX + x)) + sp] - matchData[4 * (matchWidth * y + x) + sp]);
					}
				}
			}
			const mean = grandTotal / (3 * 255 * matchWidth * matchHeight);
			return mean;
		}
		downscale(n){
			const canvas = this.toCanvas();
			const newCanvas = document.createElement("canvas");
			const width = newCanvas.width = canvas.width / n;
			const height = newCanvas.height = canvas.height / n;
			const ctx = newCanvas.getContext("2d");
			ctx.drawImage(canvas, 0, 0, width, height);
			this.setImage(newCanvas);
			return this;
		}
		matchMap(matchImageData){
			const {data, width, height} = this.imageData;
			const matchData = matchImageData.data;
			const matchWidth = matchImageData.width;
			const matchHeight = matchImageData.height;
			const ret = new ImageData(width, height);
			const retData = ret.data;
			let maxMean = 0;
			let bestX = null;
			let bestY = null;
			for ( let x = 0; x < width - matchWidth; x++ ) {
				for ( let y = 0; y < height - matchHeight; y++ ) {
					const mean = this.matchAt(x, y, matchImageData);
					if ( mean > maxMean ) {
						maxMean = mean;
						bestX = x;
						bestY = y;
					}
					for ( let sp = 0; sp < 3; sp++ ) {
						retData[4 * (width * y + x) + sp] = 255 * mean;
					}
					retData[4 * (width * y + x) + 3] = 255;
				}
			}
			retData[4 * (width * bestY + bestX)] = 255;
			retData[4 * (width * bestY + bestX) + 1] = 0;
			retData[4 * (width * bestY + bestX) + 2] = 0;
			this.setImage(ret);
			return this;
		}
		colorMatrix(matrix){
			matrix = new Float32Array(matrix);
			//5 x 4 matrix
			return this.edit(({data}, l4) => {
				for ( let i4 = 0; i4 < l4; i4 += 4 ) {
					const rgba = new Uint8ClampedArray(4);
					for ( let sp = 0; sp < 4; sp++ ) {
						rgba[sp] = data[i4 + sp];
					}
					const newRgba = new Float32Array(4);
					for ( let sp = 0; sp < 4; sp++ ) {
						newRgba[sp] = matrix[5 * sp + 4];
						for ( let msp = 0; msp < 4; msp++ ) {
							newRgba[sp] += matrix[5 * sp + msp] * rgba[msp];
						}
					}
					for ( let sp = 0; sp < 4; sp++ ) {
						data[i4 + sp] = newRgba[sp];
					}
				}
			});
		}
		linearComponentTransfer(matrix){
			matrix = new Float32Array(matrix);
			//(as defined by the W3C spec)
			//takes in a 2 * 4 matrix
			/*
				rslope rintercept
				gslope gintercept
				bslope bintercept
				aslope aintercept
			*/
			//linear: C' = slope * C + intercept
			return this.edit(({data}, l4) => {
				for ( let i4 = 0; i4 < l4; i4 += 4 ) {
					for ( let sp = 0; sp < 4; sp++ ) {
						const sp2 = 2 * sp;
						data[i4 + sp] = 255 * (matrix[sp2] * (data[i4 + sp] / 255) + matrix[sp2 + 1]);
					}
				}
			});
		}
		clone(){
			return new Lumes(this[isDoc ? "canvas" : "imageData"]);
		}
		applyFilter(name, ...args){
			Lumes.filters[name](this, ...args);
			return this;
		}
	};
	//static
	{
		Lumes.colorSpaces = {
			hsv: {
				toRGBA: ([h, s, v, alpha = 1]) => {
					const f = n => {
						const k = (n + h / 60) % 6;
						return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
					};
					return new Float32Array([f(5), f(3), f(1), alpha]);
				},
				fromRGBA: ([r, g, b, alpha = 1]) => {
					const v = Math.max(r, g, b);
					const n = v - Math.min(r, g, b);
					const h = n && (v === r ? (g - b) / n : ( v === g ? 2 + (b - r) / n : 4 + (r - g) / n ));
					return new Float32Array([60 * (h < 0 ? h + 6 : h), v && n / v, v, alpha]);
				}
			},
			hsl: {
				toRGBA: ([h, s, l, alpha = 1]) => {
					const a = s * Math.min(l, 1 - l);
					const f = n => {
						const k = (n + h / 30) % 12;
						return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
					};
					return new Float32Array([f(0), f(8), f(4), alpha]);
				},
				fromRGBA: ([r, g, b, alpha = 1]) => {
					const max = Math.max(r, g, b);
					const min = Math.min(r, g, b);
					let h;
					{
						if ( max === min && r === g && g === b ) {
							h = 0;
						} else if ( max === r ) {
							h = 60 * (0 + (g - b) / (max - min));
						} else if ( max === g ) {
							h = 60 * (2 + (b - r) / (max - min));
						} else if ( max === b ) {
							h = 60 * (4 + (r - g) / (max - min));
						}
						if ( h < 0 ) {
							h = h + 360;
						}
					}
					let s;
					{
						if ( max === 0 && (r + g + b) === 0 ) {
							s = 0;
						} else if ( min === 1 && (r + g + b) === 3 ) {
							s = 0;
						} else {
							s = (max - min) / (1 - Math.abs(max + min - 1));
						}
					}
					let l = (max + min) / 2;
					return new Float32Array([h, s, l, alpha]);
				}
			},
			cmyb: {
				//not sure about this one...
			}
		};
		//native acceleration (insanly fast for the web)
		let supportsFilter = isDoc && "filter" in CanvasRenderingContext2D.prototype;
		const editNativeFilter = (lumes, filterStr) => {
			lumes.editNative(({canvas, ctx}) => {
				ctx.filter = filterStr;
				ctx.drawImage(canvas, 0, 0);
				ctx.filter = "none";
			});
		};
		Lumes.filters = {
			gaussian: (lumes, radius, sigma = null) => {
				radius = Math.floor(radius);
				if ( supportsFilter && sigma === null ) {
					//css blur filter is a standard gaussian convolution
					editNativeFilter(lumes, `blur(${radius}px)`);
				} else {
					//convolute
					const gaussian = (x, mu, sigma) => {
						return Math.pow(Math.E, -0.5 * Math.pow((x - mu) / sigma, 2));
					};
					const kernal = (radius, sigma) => {
						const ret = [];
						const size = 2 * radius + 1;
						let sum = 0;
						for ( let y = 0; y < size; y++ ) {
							for ( let x = 0; x < size; x++ ) {
								const n = gaussian(x, radius, sigma) * gaussian(y, radius, sigma);
								ret.push(n);
								sum += n;
							}
						}
						//normalize
						for ( let i = 0, l = Math.pow(size, 2); i < l; i++ ) {
							ret[i] /= sum;
						}
						return ret;
					};
					lumes.convolute(kernal(radius * 2, sigma === null ? radius : sigma));
				}
			},
			average: (lumes, radius) => {
				radius = Math.floor(radius);
				const weights = [];
				const area = Math.pow(2 * radius + 1, 2);
				for ( let i = 0, l = area; i < l; i++ ) {
					weights.push(1 / area);
				}
				lumes.convolute(weights);
			},
			sharpen: lumes => {
				lumes.convolute([
					0, -1, 0,
					-1, 5, -1,
					0, -1, 0
				]);
			},
			brightness: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `brightness(${decimal})`);
				} else {
					lumes.linearComponentTransfer([
						decimal, 0,
						decimal, 0,
						decimal, 0,
						1, 0
					]);
				}
			},
			contrast: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `contrast(${100 * decimal}%)`);
				} else {
					const intercept = -(0.5 * decimal) + 0.5;
					lumes.linearComponentTransfer([
						decimal, intercept,
						decimal, intercept,
						decimal, intercept,
						1, 0
					]);
				}
			},
			grayscale: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `grayscale(${100 * decimal}%)`);
				} else {
					decimal = 1 - decimal;
					lumes.colorMatrix([
						0.2126 + 0.7874 * decimal, 0.7152 - 0.7152  * decimal, 0.0722 - 0.0722 * decimal, 0, 0,
						0.2126 - 0.2126 * decimal, 0.7152 + 0.2848  * decimal, 0.0722 - 0.0722 * decimal, 0, 0,
						0.2126 - 0.2126 * decimal, 0.7152 - 0.7152  * decimal, 0.0722 + 0.9278 * decimal, 0, 0,
						0, 0, 0, 1, 0
					]);
				}
			},
			hueRotate: (lumes, deg = 0) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `hue-rotate(${deg}deg)`);
				} else {
					const rad = (2 * Math.PI) * (deg / 360);
					const matrix = [
						0.213, 0.715, 0.072,
						0.213, 0.715, 0.072,
						0.213, 0.715, 0.072
					];
					const sinMatrix = [
						-0.213, -0.715, 0.928,
						0.143, 0.140, -0.283,
						-0.787, 0.715, 0.072
					];
					const cosMatrix = [
						0.787, -0.715, -0.072,
						-0.213, 0.285, -0.072,
						-0.213, -0.715, 0.928
					];
					const array = new Array(9);
					for ( let i = 0; i < 9; i++ ) {
						array[i] = matrix[i] + Math.cos(rad) * cosMatrix[i] + Math.sin(rad) * sinMatrix[i];
					}
					const [
						a00, a01, a02,
						a10, a11, a12,
						a20, a21, a22,
					] = array;
					lumes.colorMatrix([
						a00, a01, a02, 0, 0,
						a10, a11, a12, 0, 0,
						a20, a21, a22, 0, 0,
						0, 0, 0, 1, 0
					]);
				}
			},
			invert: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `invert(${100 * decimal}%)`);
				} else {
					lumes.edit(({data}, l4) => {
						for ( let i = 0; i < l4; i++ ) {
							if ( (i + 1) % 4 === 0 ) {
								continue;
							}
							const color = data[i];
							data[i] = color * (1 - decimal) + decimal * (255 - color);
						}
					});
				}
			},
			opacity: (lumes, alpha = 1) => {
				if ( isDoc ) {
					const canvas = document.createElement("canvas");
					canvas.width = lumes.width;
					canvas.height = lumes.height;
					const ctx = canvas.getContext("2d");
					ctx.imageSmoothingEnabled = false;
					ctx.globalAlpha = alpha;
					ctx.drawImage(lumes.canvas, 0, 0);
					ctx.globalAlpha = 1;
					lumes.setImage(canvas);
				} else {
					alpha *= 255;
					lumes.edit(({data}, l4) => {
						for ( let i4 = 0; i4 < l4; i4 += 4 ) {
							data[i4 + 3] = alpha;
						}
					});
				}
			},
			saturate: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `saturate(${100 * decimal}%)`);
				} else {
					//exact formula from W3C spec
					lumes.colorMatrix([
						0.213 + 0.787 * decimal, 0.715 - 0.715 * decimal, 0.072 - 0.072 * decimal, 0, 0,
						0.213 - 0.213 * decimal, 0.715 + 0.285 * decimal, 0.072 - 0.072 * decimal, 0, 0,
						0.213 - 0.213 * decimal, 0.715 - 0.715 * decimal, 0.072 + 0.928 * decimal, 0, 0,
						0, 0, 0, 1, 0
					]);
				}
			},
			sepia: (lumes, decimal = 1) => {
				if ( supportsFilter ) {
					editNativeFilter(lumes, `sepia(${100 * decimal}%)`);
				} else {
					decimal = 1 - decimal;
					lumes.colorMatrix([
						0.393 + 0.607 * decimal, 0.769 - 0.769 * decimal, 0.189 - 0.189 * decimal, 0, 0,
						0.349 - 0.349 * decimal, 0.686 + 0.314 * decimal, 0.168 - 0.168 * decimal, 0, 0,
						0.272 - 0.272 * decimal, 0.534 - 0.534 * decimal, 0.131 + 0.869 * decimal, 0, 0,
						0, 0, 0, 1, 0
					]);
				}
			},
			inverseSepia: (lumes, decimal = 1) => {
				//this isnt really a thing, it just looks cool
				lumes.applyFilter("invert", 1);
				lumes.applyFilter("sepia", decimal);
				lumes.applyFilter("invert", 1);
			},
			sobel: (lumes, round = false) => {
				//because this filter is intended to replace the original, sometimes the .clone() function can be omitted to improve performacne
				const grayscale = lumes.applyFilter("grayscale");
				const verticle = grayscale.clone().convolute([
					-1, 0, 1,
					-2, 0, 2,
					-1, 0, 1
				], true, true);
				const horizontal = grayscale.convolute([
					-1, -2, -1,
					0, 0, 0,
					1, 2, 1
				], true, true);
				const sobel = new Lumes(new ImageData(lumes.width, lumes.height)).edit(({data, width, height}) => {
					const vData = verticle.imageData.data;
					const hData = horizontal.imageData.data;
					for ( let i4 = 0, l4 = 4 * width * height; i4 < l4; i4 += 4 ) {
						let grayscale = Math.sqrt(Math.pow(vData[i4], 2) + Math.pow(hData[i4], 2));
						if ( round ) {
							grayscale = 255 * Math.round(grayscale / 255);
						}
						for ( let sp = 0; sp < 3; sp++ ) {
							data[i4 + sp] = grayscale;
						}
						data[i4 + 3] = 255;
					}
				});
				lumes.setImage(sobel);
			},
			canny: lumes => {
				lumes.applyFilter("gaussian", 2, 1.4);
				lumes.applyFilter("sobel");
				const grayscale = lumes.applyFilter("grayscale");
				let median;
				{
					const {width, height, data} = lumes.imageData;
					const length = 3 * width * height;
					const array = new Uint8ClampedArray(length);
					let pos = 0;
					for ( let i = 0, l = 4 * lumes.width * lumes.height; i < l; i++ ) {
						if ( i % 4 === 0 ) {
							continue;
						}
						array[pos++] = grayscale.imageData.data[i];
					}
					array.sort();
					const halfLength = Math.floor(length / 2);
					if ( length % 2 === 0 ) {
						median = 0.5 * array[halfLength] + 0.5 * array[halfLength + 1];
					} else {
						median = array[halfLength];
					}
				}
				const verticle = grayscale.clone().convolute([
					-1, 0, 1,
					-2, 0, 2,
					-1, 0, 1
				], true, true);
				const horizontal = grayscale.convolute([
					-1, -2, -1,
					0, 0, 0,
					1, 2, 1
				], true, true);
				const sobel = new Lumes(new ImageData(lumes.width, lumes.height)).edit(({data, width, height}) => {
					const vData = verticle.imageData.data;
					const hData = horizontal.imageData.data;
					const edgeData = new Float32Array(width * height * 2);
					for ( let i4 = 0, l4 = 4 * width * height; i4 < l4; i4 += 4 ) {
						const v = vData[i4];
						const h = hData[i4];
						const edgeGradient = Math.sqrt(Math.pow(v, 2) + Math.pow(h, 2));
						let edgeAngle = 180 * Math.atan2(v, h) / Math.PI;
						if ( edgeAngle === 360 ) {
							edgeAngle = 0;
						}
						edgeAngle = Math.abs(Math.round((8 * edgeAngle / 360) / 8));
						const i2 = Math.floor(i4 / 2);
						edgeData[i2] = edgeGradient;
						edgeData[i2 + 1] = edgeAngle;
					}
					const getXY = i4 => {
						const y = Math.floor(i4 / (width * 4));
						return {
							x: Math.floor(i4 / 4) - (y * width),
							y
						};
					};
					const getI2 = (x, y) => {
						x = limitNumber(x, 0, width - 1);
						y = limitNumber(y, 0, height - 1);
						const i2 = 2 * (y * width + x);
						return [edgeData[i2], edgeData[i2 + 1]];
					};
					for ( let i2 = 0, l2 = 2 * width * height; i2 < l2; i2 += 2 ) {
						const {x, y} = getXY(i2 * 2);
						const [edgeGradient, edgeAngle] = getI2(x, y);
						let magnitude1;
						let magnitude2;
						if ( edgeAngle === 0 ) {
							//east and west
							magnitude1 = getI2(x + 1, y)[0];
							magnitude2 = getI2(x - 1, y)[0];
						} else if ( edgeAngle === 90 ) {
							//north and south
							magnitude1 = getI2(x, y - 1)[0];
							magnitude2 = getI2(x, y + 1)[0];
						} else if ( edgeAngle === 135 ) {
							//north west and south east
							magnitude1 = getI2(x - 1, y - 1)[0];
							magnitude2 = getI2(x + 1, y + 1)[0];
						} else if ( edgeAngle === 45 ) {
							//north east and south west
							magnitude1 = getI2(x + 1, y + 1)[0];
							magnitude2 = getI2(x - 1, y - 1)[0];
						}
						let output = 0;
						if ( edgeGradient > magnitude1 && edgeGradient > magnitude2 ) {
							if ( edgeGradient >= median + 0.25 * 255 ) {
								output = 255;
							} else if ( edgeGradient >= median - 0.25 * 255) {
								//output = 128;
							}
						}
						for ( let sp = 0; sp < 3; sp++ ) {
							data[2 * i2 + sp] = output;
						}
						data[2 * i2 + 3] = 255;
					}
				});
				lumes.setImage(sobel);
			}
		};
	}
	return Lumes;
})();