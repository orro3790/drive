const fs = require('fs');
const lines = fs.readFileSync('.beads/issues.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const open = lines.filter((l) => l.status !== 'closed');
const byId = {};
lines.forEach((l) => (byId[l.id] = l));

console.log('=== EXISTING PARENT-CHILD RELATIONSHIPS (open beads) ===\n');
const parents = new Set();
open.forEach((l) => {
	if (l.parent) parents.add(l.parent);
});
open.filter((l) => l.children && l.children.length).forEach((l) => parents.add(l.id));

parents.forEach((pid) => {
	const p = byId[pid];
	if (p) {
		console.log(`${pid} (${p.status}): ${p.title}`);
		const kids = open.filter((l) => l.parent === pid);
		kids.forEach((k) => console.log(`  -> ${k.id} (${k.status}): ${k.title}`));
		console.log('');
	}
});

console.log('=== ORPHAN BEADS (no parent, not a parent) ===\n');
const childIds = new Set(open.filter((l) => l.parent).map((l) => l.id));
const parentIds = parents;
open
	.filter((l) => !l.parent && !parentIds.has(l.id))
	.forEach((l) => {
		console.log(`${l.id} (P${l.priority != null ? l.priority : '?'}, ${l.status}): ${l.title}`);
	});
