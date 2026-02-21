require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	// Check open bid windows
	const windows = await sql`
    SELECT bw.id, bw.assignment_id, bw.mode, bw.status, bw.opens_at, bw.closes_at,
           a.route_id, r.name as route_name, a.date as assignment_date
    FROM bid_windows bw
    JOIN assignments a ON a.id = bw.assignment_id
    JOIN routes r ON r.id = a.route_id
    WHERE bw.status = 'open'
    ORDER BY bw.closes_at ASC
    LIMIT 10
  `;
	console.log('Open bid windows:');
	console.log(JSON.stringify(windows, null, 2));

	// Check if driver_0003 has any pending bids
	const bids = await sql`
    SELECT b.id, b.bid_window_id, b.status, b.created_at,
           bw.mode, bw.status as window_status
    FROM bids b
    JOIN bid_windows bw ON bw.id = b.bid_window_id
    WHERE b.user_id = 'driver_0003'
    AND bw.status = 'open'
    LIMIT 5
  `;
	console.log('\nDriver 003 active bids:');
	console.log(JSON.stringify(bids, null, 2));
})();
