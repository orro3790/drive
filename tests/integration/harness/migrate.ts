import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

import type { PoolClient } from 'pg';

import { pool } from './db';

let migrated = false;

const MIGRATION_LOCK_ID = 614001;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLockTimeoutMs(): number {
	const raw = process.env.INTEGRATION_MIGRATION_LOCK_TIMEOUT_MS;
	if (!raw) {
		return DEFAULT_LOCK_TIMEOUT_MS;
	}

	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCK_TIMEOUT_MS;
}

async function acquireMigrationLock(client: PoolClient): Promise<void> {
	const timeoutMs = parseLockTimeoutMs();
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const result = await client.query<{ locked: boolean }>(
			'SELECT pg_try_advisory_lock($1::bigint) AS locked;',
			[MIGRATION_LOCK_ID]
		);

		if (result.rows[0]?.locked) {
			return;
		}

		await sleep(LOCK_POLL_INTERVAL_MS);
	}

	throw new Error(
		`Integration migration refused to start: could not acquire advisory lock ${MIGRATION_LOCK_ID} within ${timeoutMs}ms. Another integration run may still be migrating this database.`
	);
}

function runCommand(params: {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(params.command, params.args, {
			stdio: 'inherit',
			env: params.env
		});

		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			reject(new Error(`${params.command} ${params.args.join(' ')} failed with exit code ${code}`));
		});
	});
}

async function pushSchema(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('Integration migration refused to start: DATABASE_URL is not set');
	}

	const require = createRequire(import.meta.url);
	const drizzleKitEntry = require.resolve('drizzle-kit');
	const drizzleKitBin = path.join(path.dirname(drizzleKitEntry), 'bin.cjs');

	await runCommand({
		command: process.execPath,
		args: [drizzleKitBin, 'push', '--force', '--config', 'drizzle.config.ts'],
		env: {
			...process.env,
			DATABASE_URL: databaseUrl,
			DOTENV_CONFIG_QUIET: 'true'
		}
	});
}

export async function ensureMigrated(): Promise<void> {
	if (migrated) {
		return;
	}

	// Prevent concurrent migrations even if config regresses.
	// Advisory locks are session-scoped, so we must lock/unlock on the same client.
	const client = await pool.connect();
	try {
		await acquireMigrationLock(client);
		try {
			await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
			await client.query('CREATE SCHEMA public;');
			await client.query('GRANT ALL ON SCHEMA public TO public;');

			// The schema uses `gen_random_uuid()` defaults; ensure pgcrypto exists.
			await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
			await pushSchema();
			migrated = true;
		} finally {
			await client.query('SELECT pg_advisory_unlock($1::bigint);', [MIGRATION_LOCK_ID]);
		}
	} finally {
		client.release();
	}
}
