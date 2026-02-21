require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const notifs = await sql`
    SELECT type, title, body, created_at FROM notifications
    WHERE user_id = 'driver_0003'
    ORDER BY created_at DESC LIMIT 10
  `;
	console.log('=== Recent notifications for driver_0003 ===');
	for (const n of notifs) {
		const time = new Date(n.created_at).toLocaleTimeString();
		console.log(`[${time}] ${n.type}: ${n.title} — ${n.body}`);
	}
})();
