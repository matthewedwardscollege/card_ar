self.importScripts("imports/lumes.js");
const floodFillMixin = ({x, y, replacementColor, fn = null}) => {
	replacementColor = new Uint8ClampedArray(replacementColor);
	return ({width, height, data}, l4) => {
		const getI4 = (x, y) => 4 * (width * y + x);
		const getXY = i4 => {
			const y = Math.floor(i4 / (width * 4));
			return {
				x: Math.floor(i4 / 4) - (y * width),
				y
			}
		};
		const getRgba = (data, i4) => {
			const ret = new Uint8ClampedArray(4);
			for ( let i = 0; i < 4; i++ ) {
				ret[i] = data[i4 + i];
			}
			return ret;
		};
		const setRgba = (i4, rgba) => {
			for ( let i = 0; i < 4; i++ ) {
				data[i4 + i] = rgba[i];
			}
		};
		const rgbaTest = (rgba1, rgba2) => {
			if ( rgba1[3] + rgba2[3] === 0 ) {
				return true;
			}
			for ( let i = 0; i < 4; i++ ) {
				if ( rgba1[i] !== rgba2[i] ) {
					return false;
				}
			}
			return true;
		};
		(() => {
			const i4 = getI4(x, y);
			const targetColor = getRgba(data, i4);
			if ( rgbaTest(targetColor, replacementColor) ) {
				return;
			}
			setRgba(i4, replacementColor);
			const tryFill = (x, y) => {
				if ( x < 0 || y < 0 || x === width || y === height ) {
					return;
				}
				const i4 = getI4(x, y);
				const dataRgb = getRgba(data, i4);
				if ( rgbaTest(dataRgb, targetColor) ) {
					setRgba(i4, replacementColor);
					let lastQ = q;
					q = new Uint32Array(++qLength);
					q.set(lastQ);
					q[qLength - 1] = i4;
					if ( fn !== null ) {
						fn(x, y);
					}
				}
			};
			let q = new Uint32Array(1);
			q[0] = i4;
			let qLength = 1;
			while ( q.length !== 0 ) {
				const n = q[0];
				q = q.slice(1, qLength);
				qLength--;
				const {x, y} = getXY(n);
				tryFill(x - 1, y);
				tryFill(x + 1, y);
				tryFill(x, y - 1);
				tryFill(x, y + 1);
			}
		})();
	};
};
const getRealRectRotation = ({
	image,
	startX,
	startY,
	threshold = 0.25
}) => {
	const lumes = new Lumes(image);
	lumes.applyFilter("sobel");
	lumes.edit(({data}, l4) => {
		for ( let i = 0; i < l4; i++ ) {
			data[i] = data[i] < 255 * threshold ? 0 : 255;
		}
	});
	const {width, height} = lumes;
	lumes.edit(({data, width, height}) => {
		const size = 0.2 * Math.min(width, height);
		for ( let x = Math.floor(0.5 * (width - size)), l = x + Math.floor(size); x < l; x++ ) {
			for ( let y = Math.floor(0.5 * (height - size)), l = y + Math.floor(size); y < l; y++ ) {
				const i4 = 4 * (y * width + x);
				for ( let sp = 0; sp < 3; sp++ ) {
					data[i4 + sp] = 0;
				}
			}
		}
	});
	const getI4 = (x, y) => 4 * (width * y + x);
	const getXY = i4 => {
		const y = Math.floor(i4 / (width * 4));
		const pos = new Uint32Array(2);
		pos[0] = Math.floor(i4 / 4) - (y * width);
		pos[1] = y;
		return pos;
	};
	const points = {
		north: {
			array: new Uint32Array(2),
			recordDim: 1,
			maxOverride: false
		},
		south: {
			array: new Uint32Array(2),
			recordDim: 1,
			maxOverride: true
		},
		west: {
			array: new Uint32Array(2),
			recordDim: 0,
			maxOverride: false
		},
		east: {
			array: new Uint32Array(2),
			recordDim: 0,
			maxOverride: true
		}
	};
	const boundingRect = new Uint32Array(4);
	let fillArea = 0;
	let firstBorder = true;
	lumes.edit(floodFillMixin({
		x: startX,
		y: startY,
		replacementColor: new Uint32Array([255, 0, 0, 255]),
		fn: (x, y) => {
			fillArea++;
			const point = new Uint32Array([x, y]);
			if ( firstBorder ) {
				firstBorder = false;
				for ( let i = 0; i < 4; i++ ) {
					boundingRect[i] = point[i % 2];
				}
				for ( let direction in points ) {
					const {array} = points[direction];
					array[0] = point[0];
					array[1] = point[1];
				}
				return;
			}
			for ( let i = 0; i < 4; i++ ) {
				const dim = i % 2;
				const maxOverride = i >= 2;
				const record = boundingRect[i];
				const current = point[dim];
				if ( maxOverride ? current > record : current < record ) {
					boundingRect[i] = current;
				}
			}
			for ( let direction in points ) {
				const {array, recordDim, maxOverride} = points[direction];
				const record = array[recordDim];
				const current = point[recordDim];
				if ( maxOverride ? current > record : current < record ) {
					array[0] = point[0];
					array[1] = point[1];
				}
			}
		}
	}));
	boundingRect[2] -= boundingRect[0];
	boundingRect[3] -= boundingRect[1];
	for ( let direction in points ) {
		points[direction] = points[direction].array;
	}
	const getDistance = (aDirection, bDirection) => {
		const a = points[aDirection];
		const b = points[bDirection];
		return Math.sqrt(
			Math.pow(a[0] - b[0], 2)
			+ Math.pow(a[1] - b[1], 2)
		);
	};
	const northEast = getDistance("north", "east");
	const northWest = getDistance("north", "west");
	const southEast = getDistance("south", "east");
	const southWest = getDistance("south", "west");
	const getRatio = (sideA, sideB) => Math.min(sideA, sideB) / Math.max(sideA, sideB);
	const ratioPositiveSlope = getRatio(southWest, northEast);
	const ratioNegativeSlope = getRatio(northWest, southEast);
	const minRatio = 1 / 2;
	const minBoxRatio = 1 / 4;
	const meanDimA = 0.5 * (northEast + southWest);
	const meanDimB = 0.5 * (northWest + southEast);
	const bretschneidersFormula = (a, b, c, d, alpha, gamma) => {
		const s = 0.5 * (a + b + c + d);
		return Math.sqrt(
			(s - a)
			* (s - b)
			* (s - c)
			* (s - d)
			- 0.5 * a * b * c * d * (1 + Math.cos(alpha + gamma))
		);
	};
	const getPositive = theta => theta < 0 ? 2 * Math.PI + theta : theta;
	const getAngleBetweenVectors = (a, b) => {
		const angleA = getPositive(Math.atan2(a[0], a[1]));
		const angleB = getPositive(Math.atan2(b[0], b[1]));
		return Math.abs(angleA - angleB);
	};
	const getVector = (aDirection, bDirection) => {
		//vector from a to b
		//a -> b
		const a = points[aDirection];
		const b = points[bDirection];
		return new Uint32Array([
			b[0] - a[0],
			b[1] - a[1]
		]);
	};
	const area = bretschneidersFormula(
		southEast,
		northEast,
		northWest,
		southWest,
		getAngleBetweenVectors(
			getVector("north", "west"),
			getVector("north", "east")
		),
		getAngleBetweenVectors(
			getVector("south", "west"),
			getVector("south", "east")
		)
	);
	const rectArea = boundingRect[2] * boundingRect[3];
	if ( ratioPositiveSlope < minRatio
		|| ratioNegativeSlope < minRatio
		|| Math.min(meanDimA, meanDimB) / Math.max(meanDimA, meanDimB) < minBoxRatio
		|| Math.abs(fillArea - rectArea) < Math.abs(fillArea - area)
	) {
		const [x, y, width, height] = boundingRect;
		return {
			isPerfect: true,
			rect: boundingRect,
			points: {
				topLeft: new Uint32Array([x, y]),
				topRight: new Uint32Array([x + width, y]),
				bottomLeft: new Uint32Array([x, y + height]),
				bottomRight: new Uint32Array([x + width, y + height])
			},
			angle: 0,
			area: boundingRect[2] * boundingRect[3]
		};
	} else {
		const center = new Uint32Array(2);
		for ( let direction in points ) {
			const point = points[direction];
			center[0] += point[0];
			center[1] += point[1];
		}
		center[0] /= 4;
		center[1] /= 4;
		const getTheta = direction => {
			const point = points[direction];
			return Math.atan2(point[0] - center[0], point[1] - center[1]);
		};
		const angleMean = angles => {
			let x = 0;
			let y = 0;
			for ( let angle of angles ) {
				x += Math.cos(angle);
				y += Math.sin(angle);
			}
			if ( x === 0 && y === 0 ) {
				return null;
			} else {
				return Math.atan2(x, y);
			}
		};
		const angle = angleMean([
			getTheta("east"),
			getTheta("north") - Math.PI / 2,
			getTheta("west") - Math.PI,
			getTheta("south") - 3 * Math.PI / 2
		]) + Math.PI / 4;
		if ( southEast > southWest ) {
			bottomPoint2 = "east";
			leftPoint2 = "west";
		} else {
			bottomPoint2 = "west";
			leftPoint2 = "east";
		}
		return {
			isPerfect: false,
			rect: boundingRect,
			points,
			bottomPoint2,
			leftPoint2,
			angle,
			center,
			area
		};
	}
};
self.onmessage = ({
	data: {
		data,
		width,
		startX,
		startY,
		threshold
	}
}) => {
	const image = new ImageData(data, width);
	self.postMessage(getRealRectRotation({
		image,
		startX,
		startY,
		threshold
	}));
};