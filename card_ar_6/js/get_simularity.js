const getSimularity = (() => {
	const compareList = (() => {
		const getOrderSimularity = (a, b, longLength) => {
			let orderSimularity = 0;
			{
				for ( let i = 0; i < longLength; i++ ) {
					orderSimularity += a[i] === b[i] ? 1 : -1 ;
				}
				orderSimularity /= longLength;
			}
			return orderSimularity;
		};
		//compare array
		return (a, b, insensitive) => {
			if ( insensitive ) {
				if ( typeof a === "string" ) {
					a = a.toLowerCase();
					b = b.toLowerCase();
				} else {
					a = a.map(item => item.toLowerCase());
					b = b.map(item => item.toLowerCase());
				}
			}
			const aLength = a.length,
				bLength = b.length,
				combined = [...a, ...b],
				combinedLength = combined.length,
				unique = (() => {
					let ret = [];
					for ( let i = 0, l = combined.length; i < l; i++ ) {
						const ci = combined[i];
						if ( ret.indexOf(ci) === -1 ) {
							ret.push(ci);
						}
					}
					return ret;
				})(),
				uniqueLength = unique.length,
				averageLength = (aLength+bLength)*0.5;
			let orderSimularity;
			{
				//start and end order simularity
				const longLength = Math.max(aLength, bLength);
				let startOrderSimularity = getOrderSimularity(a, b, longLength);
				let endOrderSimularity = getOrderSimularity([...a].reverse(), [...b].reverse(), longLength);
				orderSimularity = Math.max(startOrderSimularity, endOrderSimularity);
			}
			//index and occurence and number index
			let indexSimularity = 0,
				countSimularity = combinedLength;
			{
				const getCount = (str, length, c) => {
					let ret = 0;
					for ( let i = 0; i < length; i++ ) {
						if ( str[i] === c ) {
							ret += 1;
						}
					}
					return ret;
				};
				for ( let i = 0; i < uniqueLength; i++ ) {
					const uc = unique[i];
					//index
					{
						indexSimularity += ( a.indexOf(uc) === -1 || b.indexOf(uc) === -1 ) ? -1 : 1;
					}
					//charOccurence
					{
						const aCount = getCount(a, aLength, uc),
							bCount = getCount(b, bLength, uc),
							difference = aCount-bCount;
						if ( difference !== 0 ) {
							countSimularity -= Math.abs(difference);
						}
					}
				}
				indexSimularity /= uniqueLength;
				countSimularity /= combinedLength;
			}
			return (orderSimularity+indexSimularity+countSimularity)/3;
		};
	})();
	const getNumbers = str => str.split(/[^0-9]/).filter(item => item.length > 0);
	//get simularity
	return (a, b, alpNumCaseBias = false) => {
		if ( alpNumCaseBias ) {
			const aNumbers = getNumbers(a),
				bNumbers = getNumbers(b);
			const arraySimularity = Math.max(compareList(a, b), compareList(a, b, true));
			if ( arraySimularity >= 0 && aNumbers.length > 0 && bNumbers.length > 0 ) {
				return (arraySimularity+(2*compareList(getNumbers(a), getNumbers(b))))/3;
			} else {
				return arraySimularity;
			}
		} else {
			return compareList(a, b);
		}
	};
})();