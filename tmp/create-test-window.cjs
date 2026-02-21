require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const mgrOrg = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';

	// Get a route in Manager 001's org
	const [route] = await sql`
    SELECT r.id, r.name, r.warehouse_id FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE w.organization_id = ${mgrOrg}
    LIMIT 1
  `;
	console.log('Using route:', route.name, route.id);

	// Feb 24 - Driver 003 has no assignment
	const [assignment] = await sql`
    INSERT INTO assignments (route_id, warehouse_id, date, status)
    VALUES (${route.id}, ${route.warehouse_id}, '2026-02-25', 'unfilled')
    RETURNING id, date
  `;
	console.log('Created assignment:', assignment);

	const now = new Date();
	const closesAt = new Date(now.getTime() + 60 * 60 * 1000);
	const [window] = await sql`
    INSERT INTO bid_windows (assignment_id, mode, status, opens_at, closes_at)
    VALUES (${assignment.id}, 'competitive', 'open', ${now.toISOString()}, ${closesAt.toISOString()})
    RETURNING id
  `;
	console.log('Created bid window:', window.id);

	await sql`
    INSERT INTO bids (assignment_id, user_id, status, bid_window_id, window_closes_at)
    VALUES (${assignment.id}, 'driver_0003', 'pending', ${window.id}, ${closesAt.toISOString()})
  `;
	console.log('Bid inserted for Driver 003');
	console.log('\n>>> Close this window:', window.id);
})();
