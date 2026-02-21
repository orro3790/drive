require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
	const r =
		await sql`SELECT fcm_token IS NOT NULL as has_token, substring(fcm_token, 1, 30) as token_prefix FROM "user" WHERE id = 'driver_0003'`;
	console.log(r[0]);
})();
