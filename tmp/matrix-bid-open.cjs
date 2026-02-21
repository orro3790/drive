/**
 * Test bid_open and emergency_route_available notifications.
 * These are sent to eligible drivers when bid windows are created.
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const MGR_ORG = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';
const BASE = 'http://localhost:5173';

(async () => {
	// Use browser session cookie (manager is logged in via agent-browser)
	const cookie =
		'better-auth.session_token=lXOvlVtGkXssmFKKyaDkqw2cbNzR6xfa.0wisLZPG8grUFgEovi5d2554p3%2F3EfV8bDpEhdUtZlE%3D';

	// Get a route in the org
	const [route] = await sql`
    SELECT r.id, r.name, r.warehouse_id FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE w.organization_id = ${MGR_ORG}
    LIMIT 1
  `;
	console.log(`Route: ${route.name}\n`);

	// --- bid_open: Cancel an assignment >24h out to trigger competitive bid window ---
	console.log('=== bid_open (competitive) ===');
	// Find a free date for driver_0006
	const busyDates006 = await sql`
    SELECT date::text FROM assignments WHERE user_id = 'driver_0006' AND status != 'cancelled' AND date >= '2026-03-20'
  `;
	const busy006 = new Set(busyDates006.map((r) => r.date));
	let bidOpenDateStr = null;
	for (let d = 20; d <= 31; d++) {
		const candidate = `2026-03-${String(d).padStart(2, '0')}`;
		if (!busy006.has(candidate)) {
			bidOpenDateStr = candidate;
			break;
		}
	}
	if (!bidOpenDateStr) {
		console.log('No free date for driver_0006!');
		process.exit(1);
	}

	const [assignBidOpen] = await sql`
    INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
    VALUES (${route.id}, ${route.warehouse_id}, ${bidOpenDateStr}, 'scheduled', 'driver_0006', 'algorithm', NOW())
    RETURNING id
  `;
	console.log(`  Created assignment ${assignBidOpen.id} for ${bidOpenDateStr} (driver_0006)`);

	// Cancel it via the API to trigger competitive bid window + bid_open notifications
	const cancelRes = await fetch(`${BASE}/api/assignments/${assignBidOpen.id}/cancel`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: cookie },
		body: JSON.stringify({ reason: 'Test cancellation for bid_open notification' })
	});
	console.log(`  Cancel => ${cancelRes.status}: ${(await cancelRes.text()).slice(0, 200)}`);

	// Check if bid_open notification was created for driver_0003
	const [bidOpenNotif] = await sql`
    SELECT type, title, body FROM notifications
    WHERE user_id = 'driver_0003' AND type = 'bid_open'
    ORDER BY created_at DESC LIMIT 1
  `;
	console.log(`  bid_open notification: ${bidOpenNotif ? bidOpenNotif.body : 'NOT FOUND'}`);

	// --- emergency_route_available ---
	console.log('\n=== emergency_route_available ===');
	// Create an assignment for today, then trigger emergency
	const today = new Date().toISOString().split('T')[0];
	const [assignEmergency] = await sql`
    INSERT INTO assignments (route_id, warehouse_id, date, status)
    VALUES (${route.id}, ${route.warehouse_id}, ${today}, 'unfilled')
    RETURNING id
  `;
	console.log(`  Created unfilled assignment ${assignEmergency.id} for today`);

	// Create emergency bid window via manager
	const emergRes = await fetch(`${BASE}/api/bid-windows`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: cookie },
		body: JSON.stringify({
			assignmentId: assignEmergency.id,
			mode: 'emergency'
		})
	});
	const emergBody = await emergRes.text();
	console.log(`  Emergency bid window => ${emergRes.status}: ${emergBody.slice(0, 200)}`);

	// Check if emergency_route_available was sent
	const [emergNotif] = await sql`
    SELECT type, title, body FROM notifications
    WHERE user_id = 'driver_0003' AND type = 'emergency_route_available'
    ORDER BY created_at DESC LIMIT 1
  `;
	console.log(`  emergency notification: ${emergNotif ? emergNotif.body : 'NOT FOUND'}`);

	console.log('\n=== DONE ===');
})();
