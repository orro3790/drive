const fs = require('fs');
const lines = fs.readFileSync('.beads/issues.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const open = lines.filter((l) => l.status !== 'closed');
open.sort((a, b) => (a.priority || 99) - (b.priority || 99));

open.forEach((l) => {
	const tags = (l.tags || []).join(', ');
	const desc = (l.description || '').substring(0, 200);
	console.log(`--- ${l.id} (P${l.priority != null ? l.priority : '?'}, ${l.status}) ---`);
	console.log(`Title: ${l.title}`);
	if (tags) console.log(`Tags: ${tags}`);
	if (desc) console.log(`Desc: ${desc}`);
	if (l.parent) console.log(`Parent: ${l.parent}`);
	if (l.children && l.children.length) console.log(`Children: ${l.children.join(', ')}`);
	console.log('');
});
