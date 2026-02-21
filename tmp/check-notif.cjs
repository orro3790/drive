require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const notifs = await sql`
    SELECT id, type, title, body, created_at
    FROM notifications
    WHERE user_id = 'driver_0003'
    ORDER BY created_at DESC
    LIMIT 3
  `;
	console.log('Latest notifications for driver_0003:');
	for (const n of notifs) {
		console.log(`  [${n.type}] "${n.title}" — "${n.body}" (${n.created_at})`);
	}

	// Check if token still valid
	const [u] =
		await sql`SELECT fcm_token IS NOT NULL as has_token FROM "user" WHERE id = 'driver_0003'`;
	console.log('Token still valid:', u.has_token);
})();
