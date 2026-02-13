import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

import { pool } from './db';

let migrated = false;

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
		await client.query('SELECT pg_advisory_lock(614001);');
		try {
			await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
			await client.query('CREATE SCHEMA public;');
			await client.query('GRANT ALL ON SCHEMA public TO public;');

			// The schema uses `gen_random_uuid()` defaults; ensure pgcrypto exists.
			await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
			await pushSchema();
			migrated = true;
		} finally {
			await client.query('SELECT pg_advisory_unlock(614001);');
		}
	} finally {
		client.release();
	}
}
