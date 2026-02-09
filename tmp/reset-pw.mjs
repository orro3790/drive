import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Get the full password hash to inspect the format
const [account] = await sql`SELECT password FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Manager hash format:', account.password.substring(0, 30) + '...');
console.log('Manager hash length:', account.password.length);

// Get a working hash for comparison
const [driverAccount] = await sql`SELECT password FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'ronny.sawayn0@driver.test'})`;
console.log('Driver hash format:', driverAccount.password.substring(0, 30) + '...');
console.log('Driver hash length:', driverAccount.password.length);
