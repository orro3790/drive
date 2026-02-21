require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const WINDOW_ID = '08f3c3fc-d96b-41a3-b690-13afcd421968';

(async () => {
	// Get manager session
	const [s] = await sql`
    SELECT token FROM session
    WHERE user_id IN (SELECT id FROM "user" WHERE email = 'manager001@drivermanager.test')
    ORDER BY created_at DESC LIMIT 1
  `;
	if (!s) {
		console.log('No session');
		process.exit(1);
	}

	const cookie =
		'better-auth.session_token=lXOvlVtGkXssmFKKyaDkqw2cbNzR6xfa.0wisLZPG8grUFgEovi5d2554p3%2F3EfV8bDpEhdUtZlE%3D';
	const res = await fetch(`http://localhost:5173/api/bid-windows/${WINDOW_ID}/close`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie
		}
	});

	console.log('Status:', res.status);
	const text = await res.text();
	console.log('Body:', text.slice(0, 500));
})();
