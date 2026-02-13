import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import { pool } from './db';
import { seedBaseline, type Baseline } from './fixtures';
import { resetDatabase } from './reset';
import { resetTime } from './time';

async function assertDbModuleAliased(): Promise<void> {
	const mod = (await import('$lib/server/db')) as unknown as {
		db?: unknown;
		pool?: unknown;
	};

	if (!mod.pool) {
		throw new Error(
			'Integration harness expected $lib/server/db to be aliased to test-client (missing `pool` export). Check vitest.integration*.config.ts resolve.alias.'
		);
	}
}

export function useIntegrationHarness() {
	let baseline: Baseline;

	beforeAll(async () => {
		await assertDbModuleAliased();
	});

	beforeEach(async () => {
		await resetDatabase();
		baseline = await seedBaseline();
	});

	afterEach(() => {
		resetTime();
	});

	afterAll(async () => {
		await pool.end();
	});

	return {
		get baseline() {
			return baseline;
		}
	};
}
