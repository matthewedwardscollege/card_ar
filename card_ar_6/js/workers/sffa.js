self.importScripts("imports/boolean_flood_fill.js");
const limitNumber = (n, min, max) => Math.max(Math.min(n, max), min);
const grayConvolute = (input, weights, width, height) => {
	const side = Math.round(Math.sqrt(weights.length));
	const halfSide = Math.floor(0.5 * side);
	const area = width * height;
	const cArea = Math.pow(side, 2);
	const ret = new Uint8ClampedArray(area);
	for ( let i = 0; i < area; i++ ) {
		const sy = Math.floor(i / width);
		const sx = Math.floor(i) - sy * width;
		let gray = 0;
		for ( let i = 0; i < cArea; i++ ) {
			const cy = Math.floor(i / side);
			const cx = Math.floor(i) - cy * side;
			const scx = limitNumber(sx + cx - halfSide, 0, width - 1);
			const scy = limitNumber(sy + cy - halfSide, 0, height - 1);
			gray += weights[cy * side + cx] * input[scy * width + scx];
		}
		ret[sy * width + sx] = Math.abs(gray);
	}
	return ret;
};
const horizontalKernal = new Float32Array([
	1, 2, 1,
	0, 0, 0,
	-1, -2, -1
]);
const verticalKernal = new Float32Array([
	1, 0, -1,
	2, 0, -2,
	1, 0, -1
]);
const sffa = ({data, width, height}) => {
	const area = width * height;
	const booleanArray = new Array(area).fill(false);
	{
		const sobel = new Uint8ClampedArray(area);
		{
			const factor = 1 / 3;
			for ( let i = 0; i < area; i++ ) {
				const i4 = 4 * i;
				sobel[i] = factor * (data[i4] + data[i4 + 1] + data[i4 + 2]);
			}
		}
		const horizontal = grayConvolute(sobel, horizontalKernal, width, height);
		const vertical = grayConvolute(sobel, verticalKernal, width, height);
		{
			let meanValue = 0;
			{
				let total = 0;
				for ( let i = 0; i < area; i++ ) {
					const value = sobel[i] = Math.sqrt(Math.pow(horizontal[i], 2) + Math.pow(vertical[i], 2));
					if ( value < 128 ) {
						meanValue += value;
						total++;
					}
				}
				meanValue /= total;
			}
			for ( let i = 0; i < area; i++ ) {
				if ( sobel[i] >= 2 * meanValue ) {
					booleanArray[i] = true;
				}
			}
		}
	}
	const boxes = [];
	{
		const thresholdSffa = [...booleanArray];
		for ( let i = 0; i < area; i++ ) {
			if ( thresholdSffa[i] ) {
				continue;
			}
			const startY = Math.floor(i / width);
			const startX = Math.floor(i) - startY * width;
			let minX = startX;
			let minY = startY;
			let maxX = startX;
			let maxY = startY;
			booleanFloodFill(thresholdSffa, width, height, startX, startY, (x, y) => {
				if ( x < minX ) {
					minX = x;
				} else if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				} else if ( y > maxY ) {
					maxY = y;
				}
			});
			const w = maxX - minX;
			const h = maxY - minY;
			if ( w * h <= 1 ) {
				continue;
			}
			boxes.push(new Uint32Array([
				minX,
				minY,
				w,
				h,
				startX,
				startY
			]));
		}
	}
	boxes.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
	return {
		booleanArray,
		boxes
	};
};
self.onmessage = ({data: {data, width}}) => {
	self.postMessage(sffa(new ImageData(data, width)));
};