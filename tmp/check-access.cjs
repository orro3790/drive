require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	// Check Manager 001's org
	const [mgr] = await sql`SELECT id, organization_id FROM "user" WHERE id = 'manager_0001'`;
	console.log('Manager 001 org:', mgr.organization_id);

	// Check Driver 003's org
	const [drv] = await sql`SELECT id, organization_id FROM "user" WHERE id = 'driver_0003'`;
	console.log('Driver 003 org:', drv.organization_id);

	// Check which warehouses belong to Manager 001's org
	const warehouses = await sql`
    SELECT w.id, w.name, w.organization_id
    FROM warehouses w
    WHERE w.organization_id = ${mgr.organization_id}
  `;
	console.log(
		'Manager 001 warehouses:',
		warehouses.map((w) => `${w.name} (${w.id})`)
	);

	// Check BN-003 route's warehouse
	const [bnRoute] = await sql`
    SELECT r.id, r.name, r.warehouse_id, w.organization_id as warehouse_org
    FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE r.name = 'BN-003'
  `;
	console.log('BN-003 warehouse org:', bnRoute?.warehouse_org);

	// Find open competitive windows where the assignment's warehouse is in Manager 001's org
	const windows = await sql`
    SELECT bw.id, bw.mode, bw.status, a.date, r.name as route_name
    FROM bid_windows bw
    JOIN assignments a ON a.id = bw.assignment_id
    JOIN routes r ON r.id = a.route_id
    JOIN warehouses w ON w.id = a.warehouse_id
    WHERE bw.status = 'open'
    AND bw.mode = 'competitive'
    AND w.organization_id = ${mgr.organization_id}
    ORDER BY a.date ASC
  `;
	console.log('\nOpen competitive windows in Manager 001 org:');
	for (const w of windows) {
		console.log(`  ${w.id} - ${w.route_name} on ${w.date}`);
	}
})();
