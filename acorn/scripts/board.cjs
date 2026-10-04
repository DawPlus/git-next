function boardCells(line) {
	return line
		.split(/(?<!\\)\|/)
		.slice(1, -1)
		.map((cell) => cell.replaceAll("\\|", "|").trim());
}

function parseBoard(board) {
	const lines = board.split(/\r?\n/).map((line) => line.trim());
	let fence = null;
	for (let i = 0; i < lines.length; i += 1) {
		const marker = lines[i].match(/^(`{3,}|~{3,})/);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
			continue;
		}
		if (fence || !lines[i].startsWith("|")) continue;
		const headers = boardCells(lines[i]);
		if (!headers.includes("Ticket") || !headers.includes("State")) continue;
		const separator = boardCells(lines[i + 1] || "");
		if (separator.length !== headers.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
		const rows = [];
		for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j += 1) {
			const row = boardCells(lines[j]);
			if (row[0]) rows.push(row);
		}
		return { headers, rows };
	}
	return { headers: [], rows: [] };
}

function boardValue(parsed, row, name) {
	const index = parsed.headers.indexOf(name);
	return index >= 0 ? row[index] : undefined;
}

module.exports = { boardCells, parseBoard, boardValue };
