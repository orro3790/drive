import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool as NodePgPool } from 'pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '$env/static/private';
import * as schema from './schema';

if (process.env.INTEGRATION_TEST === '1') {
	throw new Error(
		'Production DB client refused to start: INTEGRATION_TEST=1 detected. Integration tests must alias $lib/server/db to src/lib/server/db/test-client.ts (see vitest.integration*.config.ts).'
	);
}

function usesNeonServerless(connectionString: string): boolean {
	try {
		const hostname = new URL(connectionString).hostname.toLowerCase();
		return hostname.endsWith('.neon.tech') || hostname.endsWith('.aws.neon.tech');
	} catch {
		return false;
	}
}

function createDb() {
	if (usesNeonServerless(DATABASE_URL)) {
		neonConfig.webSocketConstructor = globalThis.WebSocket;
		const pool = new NeonPool({ connectionString: DATABASE_URL });
		return drizzleNeon({ client: pool, schema });
	}

	const pool = new NodePgPool({ connectionString: DATABASE_URL });
	return drizzleNodePg({ client: pool, schema });
}

export const db = createDb();
