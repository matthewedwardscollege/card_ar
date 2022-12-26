const booleanFloodFill = (array, width, height, startX, startY, fn = null) => {
	const i = width * startY + startX;
	if ( array[i] ) {
		return;
	}
	array[i] = true;
	const tryFill = (x, y) => {
		if ( x < 0 || y < 0 || x === width || y === height ) {
			return;
		}
		const i = width * y + x;
		if ( array[i] === false ) {
			array[i] = true;
			let lastQ = q;
			q = new Uint32Array(++qLength);
			q.set(lastQ);
			q[qLength - 1] = i;
			if ( fn !== null ) {
				fn(x, y);
			}
		}
	};
	let q = new Uint32Array(1);
	q[0] = i;
	let qLength = 1;
	while ( q.length !== 0 ) {
		const n = q[0];
		q = q.slice(1, qLength);
		qLength--;
		const y = Math.floor(n / width);
		const x = Math.floor(n) - y * width;
		tryFill(x - 1, y);
		tryFill(x + 1, y);
		tryFill(x, y - 1);
		tryFill(x, y + 1);
	}
};