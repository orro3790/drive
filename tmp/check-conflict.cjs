require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	// Check if Driver 003 has an assignment on Feb 26 (the SE-003 assignment date)
	const conflicts = await sql`
    SELECT a.id, a.date, a.status, a.user_id, r.name as route_name
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    WHERE a.user_id = 'driver_0003'
    AND a.date = '2026-02-26'
    AND a.status != 'cancelled'
  `;
	console.log('Driver 003 assignments on Feb 26:', conflicts);

	// Also check bid window status now
	const [window] = await sql`
    SELECT id, status, mode, winner_id FROM bid_windows WHERE id = 'a377cba6-8861-409f-9d62-b7cb53efac8d'
  `;
	console.log('Window status:', window);

	// Check bid status
	const bids = await sql`
    SELECT id, user_id, status, score FROM bids WHERE bid_window_id = 'a377cba6-8861-409f-9d62-b7cb53efac8d'
  `;
	console.log('Bids:', bids);
})();
