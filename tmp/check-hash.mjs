import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Compare password hash format
const managerHash =
	await sql`SELECT length(password) as len, left(password, 20) as prefix FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Manager hash:', managerHash[0]);

const driverHash =
	await sql`SELECT length(password) as len, left(password, 20) as prefix FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'ronny.sawayn0@driver.test'})`;
console.log('Driver hash:', driverHash[0]);

const seededMgrHash =
	await sql`SELECT length(password) as len, left(password, 20) as prefix FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'roselyn.barrows@drivermanager.test'})`;
console.log('Seeded manager hash:', seededMgrHash[0]);

// Check session count breakdown
const sessions =
	await sql`SELECT user_id, COUNT(*) as count FROM session GROUP BY user_id ORDER BY count DESC LIMIT 5`;
console.log('\nTop session counts:', sessions);
