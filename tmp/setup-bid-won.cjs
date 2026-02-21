require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const mgrOrg = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';

	// Find ALL open windows in Manager 001's org
	const windows = await sql`
    SELECT bw.id, bw.mode, bw.status, a.date, r.name as route_name
    FROM bid_windows bw
    JOIN assignments a ON a.id = bw.assignment_id
    JOIN routes r ON r.id = a.route_id
    JOIN warehouses w ON w.id = a.warehouse_id
    WHERE bw.status = 'open'
    AND w.organization_id = ${mgrOrg}
    ORDER BY a.date ASC
  `;
	console.log('All open windows in org:', windows);

	// Check assignments for driver_0003 that could conflict
	const upcoming = await sql`
    SELECT a.date, r.name, a.status FROM assignments a
    JOIN routes r ON r.id = a.route_id
    WHERE a.user_id = 'driver_0003' AND a.status != 'cancelled'
    AND a.date > NOW() - INTERVAL '1 day'
    ORDER BY a.date
  `;
	console.log('\nUpcoming assignments for driver_0003:');
	for (const a of upcoming) console.log(`  ${a.date} — ${a.name} (${a.status})`);
})();
