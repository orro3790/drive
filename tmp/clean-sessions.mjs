import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Delete all sessions for the manager user
const result =
	await sql`DELETE FROM session WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Deleted sessions:', result);

// Verify
const remaining =
	await sql`SELECT COUNT(*) as count FROM session WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Remaining sessions:', remaining[0].count);
