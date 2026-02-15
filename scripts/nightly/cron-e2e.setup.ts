import { vi } from 'vitest';

// Mock $lib/server/db with a stable node-postgres client.
// The Neon serverless WebSocket driver drops connections in long-running test processes.
vi.mock('$lib/server/db', async () => {
	// Load .env for local runs (secrets remain outside git).
	const { config } = await import('dotenv');
	config();

	const { Pool } = await import('pg');
	const { drizzle } = await import('drizzle-orm/node-postgres');
	// Use a relative import to avoid relying on Vite/SvelteKit path aliases in setupFiles.
	const schema = await import('../../src/lib/server/db/schema');

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('[cron-e2e] DATABASE_URL is not set');

	console.info('[cron-e2e] DB client: node-postgres (vi.mock)');
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle(pool, { schema }) };
});
