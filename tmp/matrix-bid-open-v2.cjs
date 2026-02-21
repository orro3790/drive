/**
 * Test bid_open and emergency_route_available notifications.
 * Uses hardcoded browser cookie for auth.
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const MGR_ORG = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';
const BASE = 'http://localhost:5173';
const COOKIE =
	'better-auth.session_token=lXOvlVtGkXssmFKKyaDkqw2cbNzR6xfa.0wisLZPG8grUFgEovi5d2554p3%2F3EfV8bDpEhdUtZlE%3D';

(async () => {
	const [route] = await sql`
    SELECT r.id, r.name, r.warehouse_id FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE w.organization_id = ${MGR_ORG}
    LIMIT 1
  `;
	console.log(`Route: ${route.name}\n`);

	// --- bid_open: Cancel an assignment >24h out ---
	console.log('=== bid_open (competitive) ===');

	// Use the already-created assignment from v1 (driver_0006 on 2026-03-20)
	const [existing] = await sql`
    SELECT id FROM assignments WHERE user_id = 'driver_0006' AND date = '2026-03-20' AND status = 'scheduled'
  `;
	if (!existing) {
		console.log('  No assignment to cancel. Creating fresh one...');
		// Find a free date
		const busy =
			await sql`SELECT date::text FROM assignments WHERE user_id='driver_0006' AND status!='cancelled' AND date>='2026-03-20'`;
		const busySet = new Set(busy.map((r) => r.date));
		let d;
		for (let i = 20; i <= 31; i++) {
			const c = `2026-03-${String(i).padStart(2, '0')}`;
			if (!busySet.has(c)) {
				d = c;
				break;
			}
		}
		const [a] = await sql`
      INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
      VALUES (${route.id}, ${route.warehouse_id}, ${d}, 'scheduled', 'driver_0006', 'algorithm', NOW())
      RETURNING id
    `;
		existing.id = a.id;
	}
	console.log(`  Cancelling assignment ${existing.id}`);

	const cancelRes = await fetch(`${BASE}/api/assignments/${existing.id}/cancel`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
		body: JSON.stringify({ cancelType: 'manager' })
	});
	console.log(`  Cancel => ${cancelRes.status}: ${(await cancelRes.text()).slice(0, 300)}`);

	// Check for bid_open notification created just now
	const bidOpenNotifs = await sql`
    SELECT type, title, body, created_at FROM notifications
    WHERE type = 'bid_open' AND created_at > NOW() - INTERVAL '2 minutes'
    ORDER BY created_at DESC LIMIT 3
  `;
	console.log(`  bid_open notifs (last 2 min): ${bidOpenNotifs.length}`);
	for (const n of bidOpenNotifs) console.log(`    ${n.body}`);

	// --- emergency_route_available ---
	console.log('\n=== emergency_route_available ===');
	// Use the unfilled assignment we created for today
	const [unfilled] = await sql`
    SELECT id FROM assignments WHERE date = CURRENT_DATE AND status = 'unfilled'
    AND warehouse_id = ${route.warehouse_id}
    ORDER BY created_at DESC LIMIT 1
  `;
	const assignId = unfilled?.id;
	if (!assignId) {
		const [a] = await sql`
      INSERT INTO assignments (route_id, warehouse_id, date, status)
      VALUES (${route.id}, ${route.warehouse_id}, CURRENT_DATE, 'unfilled')
      RETURNING id
    `;
		console.log(`  Created unfilled assignment ${a.id}`);
	} else {
		console.log(`  Using unfilled assignment ${assignId}`);
	}

	const emergAssignId =
		assignId ||
		(
			await sql`SELECT id FROM assignments WHERE date=CURRENT_DATE AND status='unfilled' AND warehouse_id=${route.warehouse_id} ORDER BY created_at DESC LIMIT 1`
		)[0].id;

	const emergRes = await fetch(`${BASE}/api/bid-windows`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
		body: JSON.stringify({ assignmentId: emergAssignId, mode: 'emergency' })
	});
	console.log(
		`  Emergency bid window => ${emergRes.status}: ${(await emergRes.text()).slice(0, 300)}`
	);

	// Check for emergency notification
	const emergNotifs = await sql`
    SELECT type, body, created_at FROM notifications
    WHERE type = 'emergency_route_available' AND created_at > NOW() - INTERVAL '2 minutes'
    ORDER BY created_at DESC LIMIT 3
  `;
	console.log(`  emergency notifs (last 2 min): ${emergNotifs.length}`);
	for (const n of emergNotifs) console.log(`    ${n.body}`);

	console.log('\n=== DONE ===');
})();
