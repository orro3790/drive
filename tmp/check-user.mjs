import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, email, role, created_at FROM "user" WHERE email = ${'justin.myddp@proton.me'}`;
console.log(JSON.stringify(rows, null, 2));

// Also check account table
const accounts = await sql`SELECT id, "userId", "providerId" FROM account WHERE "userId" IN (SELECT id FROM "user" WHERE email = ${'justin.myddp@proton.me'})`;
console.log('Accounts:', JSON.stringify(accounts, null, 2));
