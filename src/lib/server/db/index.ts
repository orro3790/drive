import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { DATABASE_URL } from '$env/static/private';
import * as schema from './schema';

if (process.env.INTEGRATION_TEST === '1') {
	throw new Error(
		'Production DB client refused to start: INTEGRATION_TEST=1 detected. Integration tests must alias $lib/server/db to src/lib/server/db/test-client.ts (see vitest.integration*.config.ts).'
	);
}

// Node 22+ has native WebSocket; Vercel edge runtime has it too
neonConfig.webSocketConstructor = globalThis.WebSocket;

const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });
