import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Get the working hash (password: test1234)
const [driver] =
	await sql`SELECT password FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'ronny.sawayn0@driver.test'})`;

// Set the manager's password to the same hash (test1234)
await sql`UPDATE account SET password = ${driver.password} WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;

console.log('Password updated to test1234 hash');
