import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

// Check user table columns
const cols =
	await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user' ORDER BY ordinal_position`;
console.log('User table columns:');
for (const c of cols) {
	console.log(`  ${c.column_name} (${c.data_type})`);
}

// Check account table columns
const acols =
	await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'account' ORDER BY ordinal_position`;
console.log('\nAccount table columns:');
for (const c of acols) {
	console.log(`  ${c.column_name} (${c.data_type})`);
}

// Check session table columns
const scols =
	await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'session' ORDER BY ordinal_position`;
console.log('\nSession table columns:');
for (const c of scols) {
	console.log(`  ${c.column_name} (${c.data_type})`);
}
