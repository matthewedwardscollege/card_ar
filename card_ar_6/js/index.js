window.addEventListener("DOMContentLoaded", async () => {
	{
		const isMobile = window.isMobile = /Mobi|Android/.test(navigator.userAgent);
		const width = Math.max(screen.width, screen.height);
		const height = Math.min(screen.width, screen.height);
		const setFontSize = isPortrait => {
			document.body.style.fontSize = 1.15 * width * 1 / (isMobile ? 50 : 100) + "px";
			document.body.style.display = "block";
		};
		if ( "orientation" in screen ) {
			const orientationChange = () => {
				setFontSize(screen.orientation.type.indexOf("portrait") !== -1);
			};
			orientationChange();
			window.addEventListener("orientationchange", orientationChange);
		} else {
			setFontSize(false);
		}
	}
	await new Promise(resolve => {
		const start = document.getElementById("start");
		start.addEventListener("click", () => {
			start.style.display = "none";
			document.getElementById("main-content").style.display = "";
			resolve();
		}, {
			once: true
		});
	});
	const ui = {};
	ui.updateSidebarStatus = null;
	ui.options = {
		rotationEnabled: true,
		showBounds: false
	};
	let mediaStream;
	try {
		mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: true
		});
	}
	catch ( err ) {
		alert("Error: failed to get video input. Please check your browser permissions and make sure your device has a connected camera input.");
		location.reload();
		return;
	}
	const video = document.createElement("video");
	video.srcObject = mediaStream;
	await new Promise(resolve => {
		video.onloadedmetadata = e => {
			video.play();
			resolve();
		};
	});
	const mainCanvas = document.getElementById("main-canvas");
	(async () => {
		const {videoWidth, videoHeight} = video;
		mainCanvas.width = videoWidth;
		mainCanvas.height = videoHeight;
		const videoWrapper = document.getElementById("video-wrapper");
		const resize = () => {
			const rect = videoWrapper.getBoundingClientRect();
			const widthRatio = videoWidth / videoHeight;
			const heightRatio = videoHeight / videoWidth;
			const min = Math.min(rect.width, rect.height);
			Object.assign(mainCanvas.style, {
				width: widthRatio * min + "px"
			});
			const canvasRect = mainCanvas.getBoundingClientRect();
			Object.assign(mainCanvas.style, {
				left: 0.5 * (rect.width - canvasRect.width) + "px",
				top: 0.5 * (rect.height - canvasRect.height) + "px"
			});
		};
		window.addEventListener("resize", resize);
		resize();
		const ctx = mainCanvas.getContext("2d");
		const render = (img, status) => {
			ctx.drawImage(img, ...status.rect);
		};
		const images = {
			"starry night": await CardAR.loadImageAsync("img/starry_night.webp"),
			"mona lisa": await CardAR.loadImageAsync("img/mona_lisa.jpg"),
			"cat": await CardAR.loadImageAsync("img/cat.jpg"),
			"dog": await CardAR.loadImageAsync("img/dog.jpg"),
			"oceans": await CardAR.loadVideoAsync("img/oceans.mp4")
		};
		const pendingImg = await CardAR.loadImageAsync("img/test_card.png");
		const cardAR = window.cardAR = new CardAR(video, ({status}) => {
			if ( ui.updateSidebarStatus !== null ) {
				ui.updateSidebarStatus(status);
			}
			ctx.drawImage(video, 0, 0);
			if ( ui.options.showBounds ) {
				cardAR.renderBoxes(ctx, cardAR.boxes);
			}
			if ( status === null ) {
				return;
			}
			let img;
			if ( status.text === CardAR.TEXT_PENDING ) {
				//draw pending
				img = pendingImg;
			} else {
				//draw image
				img = images[status.text];
			}
			cardAR.renderCard(ctx, img, status, ui.options.rotationEnabled, ui.options.showBounds);
		});
		cardAR.allowOcrPersistance = true;
		cardAR.options = Object.keys(images);
	})();
	{
		const controlSwitch = (id, a, b, click) => {
			const elm = document.getElementById(id);
			let isDefault = true;
			elm.addEventListener("click", () => {
				elm.innerText = (isDefault = !isDefault) ? a : b;
				click(isDefault);
			});
			elm.innerText = a;
		};
		controlSwitch("toggle-rotation-switch", "Disable Rotation", "Enable Rotation", isEnabled => {
			ui.options.rotationEnabled = isEnabled;
		});
		controlSwitch("toggle-ocr-persistance-switch", "Disable OCR Persistance", "Enable OCR Persistance", isEnabled => {
			cardAR.allowOcrPersistance = isEnabled;
		});
		controlSwitch("toggle-image-mirroring-switch", "Enable Image Mirroring", "Disable Image Mirroring", isEnabled => {
			mainCanvas.style.transform = isEnabled ? "" : "scale(-1, 1)";
		});
		controlSwitch("toggle-bounds-switch", "Show Bounds", "Hide Bounds", isEnabled => {
			ui.options.showBounds = !isEnabled;
		});
		document.getElementById("correct-brightness-btn").addEventListener("click", () => {
			const {videoWidth, videoHeight} = video;
			const canvas = document.createElement("canvas");
			canvas.width = videoWidth;
			canvas.height = videoHeight;
			const ctx = canvas.getContext("2d");
			ctx.drawImage(video, 0, 0);
			const {data} = ctx.getImageData(0, 0, videoWidth, videoHeight);
			let mean = 0;
			for ( let i = 0, l = 4 * videoWidth * videoHeight; i < l; i++ ) {
				if ( i % 4 !== 3 ) {
					mean += data[i];
				}
			}
			mean /= 3 * videoWidth * videoHeight;
			//decimal (to go from input to output) = output / input;
			//this is based on the W3C spec for the definition of the brightness
			//and linear component transfer functions in SVG and CSS
			//(output / input) is just the inverse of the brightness function
			//if the brightness function only applied to a single grayscale value
			//https://www.w3.org/TR/filter-effects-1/#attr-valuedef-type-linear
			//https://www.w3.org/TR/filter-effects-1/#brightnessEquivalent
			const decimal = 0.75 * (255 / mean);
			cardAR.brightness = decimal;
			mainCanvas.style.filter = `brightness(${100 * decimal}%)`;
		});
	}
	{
		const update = updateText => {
		};
		const statusContent = document.getElementById("status-content");
		const updateText = text => {
			statusContent.innerText = text;
		};
		updateText(JSON.stringify(null));
		ui.updateSidebarStatus = status => {
			updateText(JSON.stringify(status));
		};

	}
}, {
	once: true
});