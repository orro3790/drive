import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';
import { Client as NodePgClient, Pool } from 'pg';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from 'date-fns';
import { format } from 'date-fns-tz';

import { createRequestEvent } from '../../tests/harness/requestEvent';
import { advanceTimeByMs, freezeTime, resetTime } from '../../tests/harness/time';
import { addDaysToDateString, getTorontoDateTimeInstant } from '../../src/lib/server/time/toronto';

// Load .env for local runs (secrets remain outside git).
loadDotenv();

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

type ScenarioResult = {
	scenarioId: string;
	endpoint: string;
	status: 'todo' | 'skipped' | 'passed' | 'failed';
	statusCode?: number;
	message?: string;
	keyEntityIds?: Record<string, JsonValue>;
};

type LifecycleE2EReport = {
	run: {
		artifactDate: string;
		startedAt: string;
		finishedAt: string;
		anchorDate: string;
		frozenNow: string;
		seed: {
			reused: boolean;
			ranSeed: boolean;
			command: string;
		};
		database: {
			hostname: string;
			database: string;
		};
	};
	results: ScenarioResult[];
	overall: {
		passed: boolean;
	};
};

function assertNightlyLifecycleE2EEnabled(): void {
	if (process.env.NIGHTLY_LIFECYCLE_E2E !== '1') {
		throw new Error(
			'Refusing to run destructive lifecycle drill without NIGHTLY_LIFECYCLE_E2E=1 (use: pnpm nightly:lifecycle-e2e)'
		);
	}
}

function assertSafeDatabaseUrl(databaseUrl: string): { hostname: string; database: string } {
	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error('Refusing to run: DATABASE_URL is not a valid URL');
	}

	if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
		throw new Error(
			`Refusing to run: unsupported DATABASE_URL protocol ${JSON.stringify(url.protocol)}`
		);
	}

	const hostname = url.hostname;
	const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

	const prodSignals = ['prod', 'production'];
	const lowerHost = hostname.toLowerCase();
	const lowerDb = database.toLowerCase();
	if (prodSignals.some((token) => lowerHost.includes(token) || lowerDb.includes(token))) {
		throw new Error(
			`Refusing to run: DATABASE_URL looks like production (${hostname}/${database}). If this is actually safe, use a different DB name/host.`
		);
	}

	console.info(`[lifecycle-e2e] Using ${hostname}/${database}`);
	return { hostname, database };
}

function computeWeekdayAnchor(): string {
	let candidate = new Date();
	while (candidate.getDay() === 0 || candidate.getDay() === 6) {
		candidate = addDays(candidate, 1);
	}
	return format(candidate, 'yyyy-MM-dd');
}

async function runCommand(params: {
	command: string;
	args: string[];
	logFilePath: string;
}): Promise<void> {
	const { command, args, logFilePath } = params;
	await fs.mkdir(path.dirname(logFilePath), { recursive: true });
	const file = await fs.open(logFilePath, 'w');

	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(command, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: process.platform === 'win32'
			});

			child.stdout.on('data', (chunk) => {
				void file.appendFile(chunk);
			});
			child.stderr.on('data', (chunk) => {
				void file.appendFile(chunk);
			});
			child.on('error', reject);
			child.on('exit', (code) => {
				if (code === 0) resolve();
				else reject(new Error(`${command} exited with code ${code ?? 'null'}`));
			});
		});
	} finally {
		await file.close();
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
	const maxAttempts = 4;
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			const message = String((err as any)?.message ?? err);
			const retriable =
				message.includes('Connection terminated unexpectedly') ||
				message.includes('ECONNRESET') ||
				message.includes('fetch failed');
			if (!retriable || attempt === maxAttempts) {
				throw err;
			}
			await sleep(500 * attempt);
		}
	}
	throw lastError;
}

async function acquireAdvisoryLock(databaseUrl: string): Promise<() => Promise<void>> {
	const lockKey = 931_112_011; // stable constant; avoids hashing differences across runtimes
	const client = new NodePgClient({ connectionString: databaseUrl });

	await withDbRetry(() => client.connect());

	const result = await withDbRetry(() =>
		client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked;', [lockKey])
	);

	const locked = Boolean(result.rows[0]?.locked);
	if (!locked) {
		await client.end().catch(() => {});
		throw new Error(
			'Nightly lifecycle E2E drill lock is already held; aborting to avoid concurrent reseeds'
		);
	}

	return async () => {
		try {
			await withDbRetry(() => client.query('select pg_advisory_unlock($1);', [lockKey]));
		} finally {
			await client.end().catch(() => {});
		}
	};
}

async function querySeedOrgAId(databaseUrl: string): Promise<string | null> {
	const client = new NodePgClient({ connectionString: databaseUrl });
	await withDbRetry(() => client.connect());

	try {
		const result = await withDbRetry(() =>
			client.query<{ id: string }>('select id from organizations where slug = $1 limit 1;', [
				'seed-org-a'
			])
		);
		return result.rows[0]?.id ?? null;
	} finally {
		await client.end().catch(() => {});
	}
}

async function pickSeedAnchorDate(pool: Pool, orgId: string): Promise<string | null> {
	const result = await withDbRetry(() =>
		pool.query<{ date: string; isodow: number; count: number }>(
			`
				select
					a.date::text as date,
					extract(isodow from a.date)::int as isodow,
					count(*)::int as count
				from assignments a
				join warehouses w on w.id = a.warehouse_id
				where w.organization_id = $1
				  and a.status = 'scheduled'
				  and a.user_id is not null
				group by a.date
				order by a.date asc
				limit 60;
			`,
			[orgId]
		)
	);

	const candidate = result.rows.find((row) => row.isodow >= 1 && row.isodow <= 5 && row.count > 0);
	return candidate?.date ?? null;
}

async function queryOneRow<T extends Record<string, any>>(
	pool: Pool,
	queryText: string,
	values: unknown[]
): Promise<T | null> {
	const result = await withDbRetry(() => pool.query<T>(queryText, values));
	return result.rows[0] ?? null;
}

function createDriverLocals(userId: string, orgId: string): App.Locals {
	return {
		user: {
			id: userId,
			role: 'driver',
			organizationId: orgId,
			name: 'Test Driver',
			email: 'test@driver.test',
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			phone: null,
			weeklyCap: 4,
			isFlagged: false,
			flagWarningDate: null
		},
		organizationId: orgId
	};
}

function createManagerLocals(managerId: string, orgId: string): App.Locals {
	return {
		user: {
			id: managerId,
			role: 'manager',
			organizationId: orgId,
			name: 'Test Manager',
			email: 'test@manager.test',
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			phone: null,
			weeklyCap: 4,
			isFlagged: false,
			flagWarningDate: null
		},
		organizationId: orgId
	};
}

async function invokeEndpoint(params: {
	method: string;
	url: string;
	handler: (event: any) => Promise<Response>;
	locals: App.Locals;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	params?: Record<string, string>;
}): Promise<{ status: number; body: any }> {
	const event = createRequestEvent({
		method: params.method,
		url: `http://localhost${params.url}`,
		headers: params.headers,
		locals: params.locals,
		params: params.params ?? {},
		body: params.body ?? undefined
	});

	try {
		const response = await params.handler(event as any);
		let body: any = null;
		try {
			body = await response.json();
		} catch {
			body = null;
		}
		return { status: response.status, body };
	} catch (err: any) {
		// SvelteKit error() throws HttpError.
		if (err?.status) return { status: err.status, body: { message: err.body?.message } };
		throw err;
	}
}

function renderMarkdownReport(report: LifecycleE2EReport): string {
	const lines: string[] = [];
	lines.push(`# Lifecycle E2E Report (${report.run.artifactDate})`);
	lines.push('');
	lines.push(`- Anchor date: ${report.run.anchorDate}`);
	lines.push(`- Frozen now: ${report.run.frozenNow}`);
	lines.push(
		`- Seed: ${report.run.seed.reused ? 'reused' : 'fresh'} (ranSeed=${report.run.seed.ranSeed ? 'true' : 'false'})`
	);
	lines.push(`- DB: ${report.run.database.hostname}/${report.run.database.database}`);
	lines.push('');
	lines.push('## Scenarios');
	lines.push('');
	for (const r of report.results) {
		lines.push(`- ${r.scenarioId}: ${r.status}${r.message ? ` - ${r.message}` : ''}`);
	}
	lines.push('');
	lines.push(`Overall: ${report.overall.passed ? 'PASS' : 'FAIL'}`);
	lines.push('');
	return lines.join('\n');
}

let report: LifecycleE2EReport | null = null;
let outDir: string | null = null;
let reportJsonPath: string | null = null;
let reportMdPath: string | null = null;
let releaseLock: (() => Promise<void>) | null = null;

let databaseUrl = '';
let sqlPool: Pool | null = null;

let anchorDate = '';
let orgAId = '';
let driverUserId = '';
let lifecycleAssignmentId = '';

describe('nightly lifecycle E2E drill (dev DB)', () => {
	beforeAll(async () => {
		assertNightlyLifecycleE2EEnabled();

		databaseUrl = process.env.DATABASE_URL ?? '';
		if (!databaseUrl) {
			throw new Error('Refusing to run: DATABASE_URL is not set');
		}
		const dbFingerprint = assertSafeDatabaseUrl(databaseUrl);
		sqlPool = new Pool({ connectionString: databaseUrl });

		const artifactDate = new Date().toISOString().slice(0, 10);
		outDir = path.resolve(process.cwd(), 'logs', 'nightly', artifactDate);
		await fs.mkdir(outDir, { recursive: true });

		reportJsonPath = path.join(outDir, 'lifecycle-e2e-report.json');
		reportMdPath = path.join(outDir, 'lifecycle-e2e-report.md');
		const seedLogPath = path.join(outDir, 'lifecycle-e2e-seed.log');
		const dbPushLogPath = path.join(outDir, 'lifecycle-e2e-db-push.log');

		releaseLock = await acquireAdvisoryLock(databaseUrl);
		try {
			// Keep the shared dev DB schema in sync before running destructive scenarios.
			// (The suite can reuse an existing seed to save time, but it should still apply
			// any schema changes so service functions like audit logging don't fail.)
			await runCommand({
				command: 'pnpm',
				args: ['exec', 'drizzle-kit', 'push', '--force'],
				logFilePath: dbPushLogPath
			});

			let seedOrgExists = false;
			try {
				const existingId = await querySeedOrgAId(databaseUrl);
				seedOrgExists = Boolean(existingId);
				orgAId = existingId ?? '';
			} catch (err) {
				console.warn('[lifecycle-e2e] Seed check failed; treating as unseeded:', err);
				seedOrgExists = false;
			}

			let ranSeed = false;
			if (seedOrgExists) {
				console.info('[lifecycle-e2e] Reusing existing seed (seed-org-a already present)');
				const derived = await pickSeedAnchorDate(sqlPool, orgAId);
				if (!derived) {
					console.warn(
						'[lifecycle-e2e] Could not derive anchor date from existing seed; reseeding for stability'
					);
					seedOrgExists = false;
				}
				anchorDate = derived ?? '';
			}

			if (!seedOrgExists) {
				anchorDate = computeWeekdayAnchor();
				await runCommand({
					command: 'pnpm',
					args: ['seed', '--', '--deterministic', '--seed=20260302', `--anchor-date=${anchorDate}`],
					logFilePath: seedLogPath
				});
				ranSeed = true;
				orgAId = (await querySeedOrgAId(databaseUrl)) ?? '';
				if (!orgAId) throw new Error('[lifecycle-e2e] Seed org still missing after reseed');
			}
			const seedCommand = `pnpm seed -- --deterministic --seed=20260302 --anchor-date=${anchorDate}`;

			const frozenNow = freezeTime(new Date(`${anchorDate}T13:00:00.000Z`));

			report = {
				run: {
					artifactDate,
					startedAt: new Date().toISOString(),
					finishedAt: '',
					anchorDate,
					frozenNow: frozenNow.toISOString(),
					seed: {
						reused: seedOrgExists && !ranSeed,
						ranSeed,
						command: seedCommand
					},
					database: dbFingerprint
				},
				results: [
					{ scenarioId: 'S1', endpoint: 'POST /api/assignments/[id]/confirm', status: 'todo' },
					{ scenarioId: 'S2', endpoint: 'POST /api/shifts/arrive', status: 'todo' },
					{ scenarioId: 'S3', endpoint: 'POST /api/shifts/start', status: 'todo' },
					{ scenarioId: 'S4', endpoint: 'POST /api/shifts/complete', status: 'todo' },
					{ scenarioId: 'S5', endpoint: 'PATCH /api/shifts/[assignmentId]/edit', status: 'todo' },
					{ scenarioId: 'S6', endpoint: 'PATCH /api/shifts/[assignmentId]/edit', status: 'todo' },
					{ scenarioId: 'S7', endpoint: 'POST /api/assignments/[id]/cancel', status: 'todo' },
					{ scenarioId: 'S8', endpoint: 'POST /api/assignments/[id]/cancel', status: 'todo' },
					{ scenarioId: 'S9', endpoint: 'GET /api/cron/health-daily', status: 'todo' },
					{ scenarioId: 'S10', endpoint: 'checkAndApplyFlag(...)', status: 'todo' },
					{ scenarioId: 'S11', endpoint: 'PATCH /api/drivers/[id]', status: 'todo' }
				],
				overall: { passed: true }
			};
		} catch (err) {
			// If beforeAll fails after acquiring the advisory lock, Vitest may not run afterAll.
			// Clean up defensively to avoid leaving the shared DB locked.
			resetTime();
			if (sqlPool) {
				await sqlPool.end().catch(() => {});
				sqlPool = null;
			}
			if (releaseLock) {
				await releaseLock().catch(() => {});
				releaseLock = null;
			}
			throw err;
		}
	});

	afterAll(async () => {
		try {
			if (report) {
				report.run.finishedAt = new Date().toISOString();
				const jsonPath = reportJsonPath;
				const mdPath = reportMdPath;
				if (jsonPath) {
					await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
				}
				if (mdPath) {
					await fs.writeFile(mdPath, renderMarkdownReport(report), 'utf8');
				}
			}
		} finally {
			resetTime();
			if (sqlPool) {
				await sqlPool.end().catch(() => {});
				sqlPool = null;
			}
			if (releaseLock) {
				await releaseLock().catch(() => {});
				releaseLock = null;
			}
		}
	});

	it('S1-S11: lifecycle drill', async () => {
		expect(anchorDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(orgAId).toBeTruthy();
		expect(databaseUrl).toBeTruthy();
		if (!sqlPool) throw new Error('[lifecycle-e2e] sqlPool missing');
		if (!report) throw new Error('[lifecycle-e2e] report missing');
		const reportRef = report;

		const setScenario = (scenarioId: string, patch: Partial<ScenarioResult>): void => {
			const row = reportRef.results.find((r) => r.scenarioId === scenarioId);
			if (!row) return;
			Object.assign(row, patch);
			if (patch.status === 'failed') {
				reportRef.overall.passed = false;
			}
		};

		const selectCandidate = async (): Promise<{
			assignmentId: string;
			userId: string;
			routeStartTime: string | null;
		}> => {
			const row = await queryOneRow<{
				assignment_id: string;
				user_id: string;
				route_start_time: string | null;
			}>(
				sqlPool!,
				`
					select
						a.id as assignment_id,
						a.user_id as user_id,
						r.start_time as route_start_time
					from assignments a
					join routes r on r.id = a.route_id
					join warehouses w on w.id = a.warehouse_id
					where w.organization_id = $1
					  and a.date = $2::date
					  and a.status = 'scheduled'
					  and a.user_id is not null
					  and a.confirmed_at is null
					order by r.start_time nulls last
					limit 1;
				`,
				[orgAId, anchorDate]
			);

			if (row) {
				return {
					assignmentId: row.assignment_id,
					userId: row.user_id,
					routeStartTime: row.route_start_time
				};
			}

			// Prime: loosen confirmed filter and reset confirmedAt so S1 has a candidate.
			const primable = await queryOneRow<{
				assignment_id: string;
				user_id: string;
				route_start_time: string | null;
			}>(
				sqlPool!,
				`
					select
						a.id as assignment_id,
						a.user_id as user_id,
						r.start_time as route_start_time
					from assignments a
					join routes r on r.id = a.route_id
					join warehouses w on w.id = a.warehouse_id
					where w.organization_id = $1
					  and a.date = $2::date
					  and a.status = 'scheduled'
					  and a.user_id is not null
					order by r.start_time nulls last
					limit 1;
				`,
				[orgAId, anchorDate]
			);

			if (!primable) {
				throw new Error('[lifecycle-e2e] No scheduled seeded assignment found to confirm');
			}

			await withDbRetry(() =>
				sqlPool!.query(
					`update assignments set confirmed_at = null, updated_at = now() where id = $1;`,
					[primable.assignment_id]
				)
			);

			return {
				assignmentId: primable.assignment_id,
				userId: primable.user_id,
				routeStartTime: primable.route_start_time
			};
		};

		const candidate = await selectCandidate();
		lifecycleAssignmentId = candidate.assignmentId;
		driverUserId = candidate.userId;
		setScenario('S1', {
			status: 'skipped',
			message: `Selected assignment ${lifecycleAssignmentId} (routeStart=${candidate.routeStartTime ?? 'null'})`,
			keyEntityIds: { assignmentId: lifecycleAssignmentId, driverUserId }
		});

		const driverLocals = createDriverLocals(driverUserId, orgAId);

		// ------------------------------------------------------------------
		// S1: Confirm shift
		// ------------------------------------------------------------------
		try {
			const confirmDate = addDaysToDateString(anchorDate, -5);
			freezeTime(getTorontoDateTimeInstant(confirmDate, { hours: 8, minutes: 0, seconds: 0 }));

			const confirm = await import('../../src/routes/api/assignments/[id]/confirm/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/assignments/${lifecycleAssignmentId}/confirm`,
				handler: confirm.POST,
				locals: driverLocals,
				params: { id: lifecycleAssignmentId }
			});

			expect(run.status).toBe(200);
			expect(run.body?.success).toBe(true);
			expect(run.body?.confirmedAt).toBeTruthy();

			const confirmed = await queryOneRow<{ confirmed_at: string | null }>(
				sqlPool!,
				`select confirmed_at::text as confirmed_at from assignments where id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(confirmed?.confirmed_at).toBeTruthy();

			setScenario('S1', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S1', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S2: Arrive
		// ------------------------------------------------------------------
		try {
			// Arrive must be before the route's Toronto start time; 06:00 is safe even for 07:00 routes.
			freezeTime(getTorontoDateTimeInstant(anchorDate, { hours: 6, minutes: 0, seconds: 0 }));
			advanceTimeByMs(1000);

			const beforeArrive = await queryOneRow<{ arrived_on_time_count: number }>(
				sqlPool!,
				`select arrived_on_time_count::int as arrived_on_time_count from driver_metrics where user_id = $1;`,
				[driverUserId]
			);
			const beforeCount = beforeArrive?.arrived_on_time_count ?? 0;

			const arrive = await import('../../src/routes/api/shifts/arrive/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/shifts/arrive`,
				handler: arrive.POST,
				locals: driverLocals,
				body: { assignmentId: lifecycleAssignmentId }
			});

			expect(run.status).toBe(200);
			expect(run.body?.success).toBe(true);
			expect(run.body?.arrivedAt).toBeTruthy();

			const shiftRow = await queryOneRow<{ arrived_at: string | null }>(
				sqlPool!,
				`select arrived_at::text as arrived_at from shifts where assignment_id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(shiftRow?.arrived_at).toBeTruthy();

			const assignmentRow = await queryOneRow<{ status: string }>(
				sqlPool!,
				`select status from assignments where id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(assignmentRow?.status).toBe('active');

			const afterArrive = await queryOneRow<{ arrived_on_time_count: number }>(
				sqlPool!,
				`select arrived_on_time_count::int as arrived_on_time_count from driver_metrics where user_id = $1;`,
				[driverUserId]
			);
			const afterCount = afterArrive?.arrived_on_time_count ?? 0;
			expect(afterCount).toBe(beforeCount + 1);

			setScenario('S2', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S2', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S3: Start (record parcels)
		// ------------------------------------------------------------------
		try {
			advanceTimeByMs(1000);
			const start = await import('../../src/routes/api/shifts/start/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/shifts/start`,
				handler: start.POST,
				locals: driverLocals,
				body: { assignmentId: lifecycleAssignmentId, parcelsStart: 150 }
			});

			expect(run.status).toBe(200);
			expect(run.body?.shift?.parcelsStart).toBe(150);
			expect(run.body?.shift?.startedAt).toBeTruthy();

			const shiftRow = await queryOneRow<{
				parcels_start: number | null;
				started_at: string | null;
			}>(
				sqlPool!,
				`select parcels_start::int as parcels_start, started_at::text as started_at from shifts where assignment_id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(shiftRow?.parcels_start).toBe(150);
			expect(shiftRow?.started_at).toBeTruthy();

			setScenario('S3', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S3', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S4: Complete
		// ------------------------------------------------------------------
		try {
			advanceTimeByMs(1000);
			const before = await queryOneRow<{ high_delivery_count: number }>(
				sqlPool!,
				`select high_delivery_count::int as high_delivery_count from driver_metrics where user_id = $1;`,
				[driverUserId]
			);
			const beforeCount = before?.high_delivery_count ?? 0;

			const complete = await import('../../src/routes/api/shifts/complete/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/shifts/complete`,
				handler: complete.POST,
				locals: driverLocals,
				body: {
					assignmentId: lifecycleAssignmentId,
					parcelsReturned: 5,
					exceptedReturns: 2,
					exceptionNotes: 'Holiday closures'
				}
			});

			expect(run.status).toBe(200);
			expect(run.body?.shift?.parcelsDelivered).toBe(145);
			expect(run.body?.shift?.editableUntil).toBeTruthy();

			const assignmentRow = await queryOneRow<{ status: string }>(
				sqlPool!,
				`select status from assignments where id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(assignmentRow?.status).toBe('completed');

			const shiftRow = await queryOneRow<{
				completed_at: string | null;
				editable_until: string | null;
				parcels_delivered: number | null;
			}>(
				sqlPool!,
				`select completed_at::text as completed_at, editable_until::text as editable_until, parcels_delivered::int as parcels_delivered from shifts where assignment_id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(shiftRow?.completed_at).toBeTruthy();
			expect(shiftRow?.editable_until).toBeTruthy();
			expect(shiftRow?.parcels_delivered).toBe(145);

			const after = await queryOneRow<{ high_delivery_count: number }>(
				sqlPool!,
				`select high_delivery_count::int as high_delivery_count from driver_metrics where user_id = $1;`,
				[driverUserId]
			);
			const afterCount = after?.high_delivery_count ?? 0;
			expect(afterCount).toBe(beforeCount + 1);

			setScenario('S4', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S4', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S5: Edit (within window)
		// ------------------------------------------------------------------
		try {
			advanceTimeByMs(1000);
			const edit = await import('../../src/routes/api/shifts/[assignmentId]/edit/+server');
			const run = await invokeEndpoint({
				method: 'PATCH',
				url: `/api/shifts/${lifecycleAssignmentId}/edit`,
				handler: edit.PATCH,
				locals: driverLocals,
				params: { assignmentId: lifecycleAssignmentId },
				body: {
					parcelsReturned: 8,
					exceptedReturns: 3,
					exceptionNotes: 'Updated closures'
				}
			});

			expect(run.status).toBe(200);
			expect(run.body?.success).toBe(true);
			expect(run.body?.shift?.parcelsDelivered).toBe(142);

			const shiftRow = await queryOneRow<{ parcels_returned: number; excepted_returns: number }>(
				sqlPool!,
				`select parcels_returned::int as parcels_returned, excepted_returns::int as excepted_returns from shifts where assignment_id = $1 limit 1;`,
				[lifecycleAssignmentId]
			);
			expect(shiftRow?.parcels_returned).toBe(8);
			expect(shiftRow?.excepted_returns).toBe(3);

			setScenario('S5', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S5', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S6: Edit (expired window)
		// ------------------------------------------------------------------
		try {
			advanceTimeByMs(2 * 60 * 60 * 1000);
			const edit = await import('../../src/routes/api/shifts/[assignmentId]/edit/+server');
			const run = await invokeEndpoint({
				method: 'PATCH',
				url: `/api/shifts/${lifecycleAssignmentId}/edit`,
				handler: edit.PATCH,
				locals: driverLocals,
				params: { assignmentId: lifecycleAssignmentId },
				body: {
					parcelsReturned: 8,
					exceptedReturns: 3,
					exceptionNotes: 'Updated closures'
				}
			});

			expect(run.status).toBe(400);
			setScenario('S6', { status: 'passed', statusCode: run.status });
		} catch (err: any) {
			setScenario('S6', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S7: Early cancellation
		// ------------------------------------------------------------------
		let earlyCancelAssignmentId = '';
		let earlyCancelDate = '';
		try {
			const candidate = await queryOneRow<{ assignment_id: string; user_id: string; date: string }>(
				sqlPool!,
				`
					select a.id as assignment_id, a.user_id as user_id, a.date::text as date
					from assignments a
					join warehouses w on w.id = a.warehouse_id
					left join bid_windows bw on bw.assignment_id = a.id and bw.status = 'open'
					where w.organization_id = $1
					  and a.status = 'scheduled'
					  and a.user_id is not null
					  and a.confirmed_at is null
					  and bw.id is null
					  and a.id <> $2
					order by a.date asc
					limit 1;
				`,
				[orgAId, lifecycleAssignmentId]
			);
			if (!candidate) throw new Error('[lifecycle-e2e] No early-cancel candidate found');

			earlyCancelAssignmentId = candidate.assignment_id;
			earlyCancelDate = candidate.date;
			freezeTime(
				new Date(new Date(`${earlyCancelDate}T13:00:00.000Z`).getTime() - 7 * 24 * 60 * 60 * 1000)
			);
			advanceTimeByMs(1000);
			const cancelDriverId = candidate.user_id;
			const cancelLocals = createDriverLocals(cancelDriverId, orgAId);

			const before = await queryOneRow<{ late_cancellations: number }>(
				sqlPool!,
				`select late_cancellations::int as late_cancellations from driver_metrics where user_id = $1;`,
				[cancelDriverId]
			);
			const beforeCount = before?.late_cancellations ?? 0;

			const cancel = await import('../../src/routes/api/assignments/[id]/cancel/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/assignments/${earlyCancelAssignmentId}/cancel`,
				handler: cancel.POST,
				locals: cancelLocals,
				params: { id: earlyCancelAssignmentId },
				body: { reason: 'personal_emergency' }
			});

			expect(run.status).toBe(200);
			expect(run.body?.assignment?.status).toBe('cancelled');

			const after = await queryOneRow<{ late_cancellations: number }>(
				sqlPool!,
				`select late_cancellations::int as late_cancellations from driver_metrics where user_id = $1;`,
				[cancelDriverId]
			);
			const afterCount = after?.late_cancellations ?? 0;
			expect(afterCount).toBe(beforeCount);

			const assignmentRow = await queryOneRow<{
				status: string;
				user_id: string | null;
				cancel_type: string | null;
				cancelled_at: string | null;
			}>(
				sqlPool!,
				`select status, user_id, cancel_type, cancelled_at::text as cancelled_at from assignments where id = $1 limit 1;`,
				[earlyCancelAssignmentId]
			);
			expect(assignmentRow?.cancel_type).toBe('driver');
			expect(assignmentRow?.cancelled_at).toBeTruthy();
			expect(assignmentRow?.status).toBe('unfilled');
			expect(assignmentRow?.user_id).toBeNull();

			const windowRow = await queryOneRow<{ mode: string; status: string }>(
				sqlPool!,
				`select mode, status from bid_windows where assignment_id = $1 and trigger = 'cancellation' order by opens_at desc limit 1;`,
				[earlyCancelAssignmentId]
			);
			expect(windowRow?.status).toBe('open');
			expect(windowRow?.mode).toBe('competitive');

			setScenario('S7', {
				status: 'passed',
				statusCode: run.status,
				keyEntityIds: { assignmentId: earlyCancelAssignmentId, driverUserId: cancelDriverId }
			});
		} catch (err: any) {
			setScenario('S7', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S8: Late cancellation
		// ------------------------------------------------------------------
		try {
			const candidate = await queryOneRow<{
				assignment_id: string;
				user_id: string;
				date: string;
				confirmed_at: string | null;
			}>(
				sqlPool!,
				`
					select
						a.id as assignment_id,
						a.user_id as user_id,
						a.date::text as date,
						a.confirmed_at::text as confirmed_at
					from assignments a
					join warehouses w on w.id = a.warehouse_id
					left join bid_windows bw on bw.assignment_id = a.id and bw.status = 'open'
					where w.organization_id = $1
					  and a.status = 'scheduled'
					  and a.user_id is not null
					  and bw.id is null
					  and a.id <> $2
					  and a.id <> $3
					order by a.date asc
					limit 1;
				`,
				[orgAId, lifecycleAssignmentId, earlyCancelAssignmentId]
			);
			if (!candidate) throw new Error('[lifecycle-e2e] No late-cancel candidate found');

			const lateCancelAssignmentId = candidate.assignment_id;
			const cancelDriverId = candidate.user_id;
			const lateCancelDate = candidate.date;
			const cancelLocals = createDriverLocals(cancelDriverId, orgAId);

			// Prime for deterministic behavior on a reused DB: ensure no pre-existing open window
			// blocks createBidWindow (it would early-return without un-filling the assignment).
			await withDbRetry(() =>
				sqlPool!.query(
					`update bid_windows set status = 'closed' where assignment_id = $1 and status = 'open';`,
					[lateCancelAssignmentId]
				)
			);

			if (!candidate.confirmed_at) {
				freezeTime(
					new Date(new Date(`${lateCancelDate}T13:00:00.000Z`).getTime() - 5 * 24 * 60 * 60 * 1000)
				);
				advanceTimeByMs(1000);
				const confirm = await import('../../src/routes/api/assignments/[id]/confirm/+server');
				const confirmed = await invokeEndpoint({
					method: 'POST',
					url: `/api/assignments/${lateCancelAssignmentId}/confirm`,
					handler: confirm.POST,
					locals: cancelLocals,
					params: { id: lateCancelAssignmentId }
				});
				expect(confirmed.status).toBe(200);
			}

			freezeTime(
				new Date(new Date(`${lateCancelDate}T13:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000)
			);
			advanceTimeByMs(1000);

			const before = await queryOneRow<{ late_cancellations: number }>(
				sqlPool!,
				`select late_cancellations::int as late_cancellations from driver_metrics where user_id = $1;`,
				[cancelDriverId]
			);
			const beforeCount = before?.late_cancellations ?? 0;

			const cancel = await import('../../src/routes/api/assignments/[id]/cancel/+server');
			const run = await invokeEndpoint({
				method: 'POST',
				url: `/api/assignments/${lateCancelAssignmentId}/cancel`,
				handler: cancel.POST,
				locals: cancelLocals,
				params: { id: lateCancelAssignmentId },
				body: { reason: 'personal_emergency' }
			});

			expect(run.status).toBe(200);
			expect(run.body?.assignment?.status).toBe('cancelled');

			const after = await queryOneRow<{ late_cancellations: number }>(
				sqlPool!,
				`select late_cancellations::int as late_cancellations from driver_metrics where user_id = $1;`,
				[cancelDriverId]
			);
			const afterCount = after?.late_cancellations ?? 0;
			expect(afterCount).toBe(beforeCount + 1);

			const assignmentRow = await queryOneRow<{
				status: string;
				user_id: string | null;
				cancel_type: string | null;
				cancelled_at: string | null;
			}>(
				sqlPool!,
				`select status, user_id, cancel_type, cancelled_at::text as cancelled_at from assignments where id = $1 limit 1;`,
				[lateCancelAssignmentId]
			);
			expect(assignmentRow?.cancel_type).toBe('late');
			expect(assignmentRow?.cancelled_at).toBeTruthy();
			expect(assignmentRow?.status).toBe('unfilled');
			expect(assignmentRow?.user_id).toBeNull();

			const windowRow = await queryOneRow<{ mode: string; status: string }>(
				sqlPool!,
				`select mode, status from bid_windows where assignment_id = $1 and trigger = 'cancellation' order by opens_at desc limit 1;`,
				[lateCancelAssignmentId]
			);
			expect(windowRow?.status).toBe('open');
			expect(windowRow?.mode).toBe('instant');

			setScenario('S8', {
				status: 'passed',
				statusCode: run.status,
				keyEntityIds: { assignmentId: lateCancelAssignmentId, driverUserId: cancelDriverId }
			});
		} catch (err: any) {
			setScenario('S8', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S9: Health scoring verification
		// ------------------------------------------------------------------
		try {
			freezeTime(getTorontoDateTimeInstant(anchorDate, { hours: 8, minutes: 0, seconds: 0 }));
			advanceTimeByMs(1000);

			const cronSecret = process.env.CRON_SECRET?.trim();
			if (!cronSecret) {
				throw new Error('Refusing to run: CRON_SECRET is not set (required for cron auth)');
			}

			const healthDaily = await import('../../src/routes/api/cron/health-daily/+server');
			const run = await invokeEndpoint({
				method: 'GET',
				url: `/api/cron/health-daily`,
				handler: healthDaily.GET,
				locals: {} as any,
				headers: {
					authorization: `Bearer ${cronSecret}`
				}
			});

			expect(run.status).toBe(200);
			expect(run.body?.success).toBe(true);

			const snapshot = await queryOneRow<{ score: number }>(
				sqlPool!,
				`select score::int as score from driver_health_snapshots where user_id = $1 and evaluated_at = $2::date limit 1;`,
				[driverUserId, anchorDate]
			);
			expect(snapshot).toBeTruthy();
			expect(snapshot?.score ?? 0).toBeGreaterThanOrEqual(0);
			expect(snapshot?.score ?? 0).toBeLessThanOrEqual(100);

			setScenario('S9', {
				status: 'passed',
				statusCode: run.status,
				keyEntityIds: { driverUserId, evaluatedAt: anchorDate, score: snapshot?.score ?? null }
			});
		} catch (err: any) {
			setScenario('S9', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S10: Flagging check
		// ------------------------------------------------------------------
		let unreliableDriverId = '';
		try {
			const candidate = await queryOneRow<{
				user_id: string;
				total_shifts: number;
				attendance_rate: number;
			}>(
				sqlPool!,
				`
					select
						dm.user_id as user_id,
						dm.total_shifts::int as total_shifts,
						dm.attendance_rate::float as attendance_rate
					from driver_metrics dm
					join "user" u on u.id = dm.user_id
					where u.organization_id = $1
					  and u.role = 'driver'
					  and u.is_flagged = false
					  and dm.total_shifts > 0
					  and (
						(dm.total_shifts < 10 and dm.attendance_rate < 0.8)
						or (dm.total_shifts >= 10 and dm.attendance_rate < 0.7)
					  )
					order by dm.attendance_rate asc
					limit 1;
				`,
				[orgAId]
			);
			if (!candidate) throw new Error('[lifecycle-e2e] No unreliable driver found for flagging');
			unreliableDriverId = candidate.user_id;

			const flagging = await import('../../src/lib/server/services/flagging');
			const result = await flagging.checkAndApplyFlag(unreliableDriverId, orgAId);
			expect(result?.isFlagged).toBe(true);
			expect(result?.flagWarningDate).toBeTruthy();

			const userRow = await queryOneRow<{ is_flagged: boolean; flag_warning_date: string | null }>(
				sqlPool!,
				`select is_flagged as is_flagged, flag_warning_date::text as flag_warning_date from "user" where id = $1 limit 1;`,
				[unreliableDriverId]
			);
			expect(userRow?.is_flagged).toBe(true);
			expect(userRow?.flag_warning_date).toBeTruthy();

			const notif = await queryOneRow<{ id: string }>(
				sqlPool!,
				`select id from notifications where user_id = $1 and type = 'warning' order by created_at desc limit 1;`,
				[unreliableDriverId]
			);
			expect(notif?.id).toBeTruthy();

			setScenario('S10', {
				status: 'passed',
				keyEntityIds: {
					unreliableDriverId,
					totalShifts: candidate.total_shifts,
					attendanceRate: candidate.attendance_rate
				}
			});
		} catch (err: any) {
			setScenario('S10', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}

		// ------------------------------------------------------------------
		// S11: Manager reinstatement
		// ------------------------------------------------------------------
		try {
			if (!unreliableDriverId) throw new Error('[lifecycle-e2e] Missing unreliableDriverId');

			await withDbRetry(() =>
				sqlPool!.query(
					`
						insert into driver_health_state (user_id, assignment_pool_eligible, requires_manager_intervention, updated_at)
						values ($1, false, true, now())
						on conflict (user_id)
						do update set assignment_pool_eligible = false, requires_manager_intervention = true, updated_at = now();
					`,
					[unreliableDriverId]
				)
			);

			const manager = await queryOneRow<{ id: string }>(
				sqlPool!,
				`select id from "user" where organization_id = $1 and role = 'manager' limit 1;`,
				[orgAId]
			);
			if (!manager?.id) throw new Error('[lifecycle-e2e] No manager found for reinstatement');

			const driversApi = await import('../../src/routes/api/drivers/[id]/+server');
			const run = await invokeEndpoint({
				method: 'PATCH',
				url: `/api/drivers/${unreliableDriverId}`,
				handler: driversApi.PATCH,
				locals: createManagerLocals(manager.id, orgAId),
				params: { id: unreliableDriverId },
				body: { reinstate: true }
			});

			expect(run.status).toBe(200);
			expect(run.body?.driver?.assignmentPoolEligible).toBe(true);

			const stateRow = await queryOneRow<{
				assignment_pool_eligible: boolean;
				requires_manager_intervention: boolean;
				reinstated_at: string | null;
			}>(
				sqlPool!,
				`select assignment_pool_eligible as assignment_pool_eligible, requires_manager_intervention as requires_manager_intervention, reinstated_at::text as reinstated_at from driver_health_state where user_id = $1 limit 1;`,
				[unreliableDriverId]
			);
			expect(stateRow?.assignment_pool_eligible).toBe(true);
			expect(stateRow?.requires_manager_intervention).toBe(false);
			expect(stateRow?.reinstated_at).toBeTruthy();

			setScenario('S11', {
				status: 'passed',
				statusCode: run.status,
				keyEntityIds: { unreliableDriverId, managerId: manager.id }
			});
		} catch (err: any) {
			setScenario('S11', { status: 'failed', message: String(err?.message ?? err) });
			throw err;
		}
	});
});
