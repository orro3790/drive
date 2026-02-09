import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Find seeded managers
const managers = await sql`SELECT email FROM "user" WHERE role = 'manager' AND email LIKE '%@drivermanager.test' LIMIT 3`;
console.log('Seeded managers:', managers.map(m => m.email));

// Also check if any drivers with manager role
const otherManagers = await sql`SELECT email FROM "user" WHERE role IN ('manager', 'admin') AND email NOT LIKE '%@drivermanager.test'`;
console.log('Other managers/admins:', otherManagers.map(m => m.email));
