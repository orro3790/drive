import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

function assertSafeIntegrationDbUrl(): string {
	if (process.env.INTEGRATION_TEST !== '1') {
		throw new Error(
			'Integration DB client refused to start: set INTEGRATION_TEST=1 (use pnpm test:integration:*)'
		);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('Integration DB client refused to start: DATABASE_URL is not set');
	}

	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error('Integration DB client refused to start: DATABASE_URL is not a valid URL');
	}

	if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
		throw new Error(
			`Integration DB client refused to start: unsupported protocol ${JSON.stringify(url.protocol)}`
		);
	}

	const hostname = url.hostname;
	const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));

	if (!databaseName || !databaseName.endsWith('_integration')) {
		throw new Error(
			'Integration DB client refused to start: DATABASE_URL database name must end with "_integration"'
		);
	}

	const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
	const allowNonLocal = process.env.ALLOW_NONLOCAL_INTEGRATION_DB === '1';

	if (!isLocalHost && !allowNonLocal) {
		throw new Error(
			`Integration DB client refused to start: non-local host ${JSON.stringify(hostname)} is not allowed (set ALLOW_NONLOCAL_INTEGRATION_DB=1 to override)`
		);
	}

	if (!isLocalHost) {
		const deniedHostSuffixes = [
			'neon.tech',
			'supabase.co',
			'railway.app',
			'render.com',
			'azure.com',
			'googleapis.com',
			'amazonaws.com'
		];

		const matchesDeniedSuffix = deniedHostSuffixes.some((suffix) =>
			hostname.toLowerCase().endsWith(suffix)
		);

		if (matchesDeniedSuffix) {
			throw new Error(
				`Integration DB client refused to start: host ${JSON.stringify(hostname)} looks like a remote managed DB (${deniedHostSuffixes.join(', ')})`
			);
		}
	}

	// Small breadcrumb to help responders confirm which DB they're about to touch.
	// (Only ever runs in integration tests due to INTEGRATION_TEST guard above.)
	console.info(
		`[integration-db] Using ${hostname}/${databaseName} (ALLOW_NONLOCAL_INTEGRATION_DB=${allowNonLocal ? '1' : '0'})`
	);

	return databaseUrl;
}

const databaseUrl = assertSafeIntegrationDbUrl();

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
