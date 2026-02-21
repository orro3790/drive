require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const notifs = await sql`
    SELECT type, title, body, created_at FROM notifications
    WHERE user_id = 'driver_0003'
    ORDER BY created_at DESC LIMIT 5
  `;
	for (const n of notifs) {
		console.log(`${n.type} | ${n.title} | ${n.body} | ${n.created_at}`);
	}
})();
