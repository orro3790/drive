import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Check account for manager user
const accounts = await sql`SELECT id, account_id, provider_id, password IS NOT NULL as has_password, created_at FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Manager accounts:', JSON.stringify(accounts, null, 2));

// Compare with a working driver
const driverAccounts = await sql`SELECT id, account_id, provider_id, password IS NOT NULL as has_password, created_at FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ${'ronny.sawayn0@driver.test'})`;
console.log('Driver accounts:', JSON.stringify(driverAccounts, null, 2));

// Check session count for manager
const sessions = await sql`SELECT COUNT(*) as count FROM session WHERE user_id = (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Manager sessions:', sessions[0].count);
