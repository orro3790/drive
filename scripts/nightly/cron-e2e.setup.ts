import { vi } from 'vitest';

// Mock $lib/server/db with a stable node-postgres client.
// The Neon serverless WebSocket driver drops connections in long-running test processes.
vi.mock('$lib/server/db', async () => {
	const { config } = await import('dotenv');
	config();
	const { Pool } = await import('pg');
	const { drizzle } = await import('drizzle-orm/node-postgres');
	const schema = await import('$lib/server/db/schema');
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('[cron-e2e] DATABASE_URL is not set');
	console.info('[cron-e2e] DB client: node-postgres (vi.mock)');
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle(pool, { schema }) };
});
