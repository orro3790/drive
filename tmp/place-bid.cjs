require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const windowId = '5099a662-d15f-496e-a0a7-ed81d9d9ba44';
	const assignmentId = 'bd156dc9-8125-40e9-89ce-bde2a0ef383b';
	const driverId = 'driver_0003';

	// Get the window closes_at
	const [window] = await sql`SELECT closes_at FROM bid_windows WHERE id = ${windowId}`;
	console.log('Window closes at:', window.closes_at);

	// Insert a pending bid for Driver 003
	const [bid] = await sql`
    INSERT INTO bids (assignment_id, user_id, status, bid_window_id, window_closes_at)
    VALUES (${assignmentId}, ${driverId}, 'pending', ${windowId}, ${window.closes_at})
    RETURNING id, status, bid_at
  `;
	console.log('Bid inserted:', bid);

	// Verify
	const bids = await sql`
    SELECT id, user_id, status FROM bids WHERE bid_window_id = ${windowId}
  `;
	console.log('All bids on this window:', bids);
})();
