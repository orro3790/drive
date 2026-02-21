const fs = require('fs');
const lines = fs.readFileSync('.beads/issues.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const open = lines.filter((l) => l.status !== 'closed');
open.sort((a, b) => (a.priority || 99) - (b.priority || 99));
const closed = lines.filter((l) => l.status === 'closed');
console.log(`Total: ${lines.length} | Open: ${open.length} | Closed: ${closed.length}`);
console.log('');
console.log('=== OPEN BEADS ===');
open.forEach((l) => {
	const tags = (l.tags || []).join(', ');
	console.log(
		`${l.id.padStart(10)} | ${l.status.padStart(8)} | P${l.priority != null ? l.priority : '?'} | ${l.title}${tags ? ' [' + tags + ']' : ''}`
	);
});
