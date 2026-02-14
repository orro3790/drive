import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';
import { Client as NodePgClient } from 'pg';

import { describe, it } from 'vitest';
import { addDays, addWeeks, set, startOfDay } from 'date-fns';
import { format, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import {
	assignments,
	bids,
	bidWindows,
	driverHealthSnapshots,
	driverHealthState,
	driverMetrics,
	notifications,
	organizations,
	routes,
	shifts,
	user,
	warehouses
} from '../../src/lib/server/db/schema';
import { dispatchPolicy, parseRouteStartTime } from '../../src/lib/config/dispatchPolicy';
import { getWeekStart } from '../../src/lib/server/services/scheduling';

import { createRequestEvent } from '../../tests/harness/requestEvent';
import { freezeTime, resetTime } from '../../tests/harness/time';

// Load .env for local runs (secrets remain outside git).
loadDotenv();

let db: any;

function initDb(databaseUrl: string): void {
	const sqlClient = neon(databaseUrl);
	db = drizzle(sqlClient);
}

async function closeDb(): Promise<void> {
	// neon-http client is stateless; no pool to close
}

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

type InvariantResult = {
	invariantId: string;
	passed: boolean;
	message?: string;
	evidence?: JsonValue;
};

type ScenarioResult = {
	scenarioId: string;
	endpoint: string;
	run1: { status: number; body: JsonValue };
	run2: { status: number; body: JsonValue };
	invariants: InvariantResult[];
	keyEntityIds?: Record<string, JsonValue>;
};

type CronE2EReport = {
	run: {
		artifactDate: string;
		startedAt: string;
		finishedAt: string;
		frozenNow: string;
		seed: {
			deterministic: true;
			seed: number;
			anchorDate: string;
			command: string;
		};
		database: {
			hostname: string;
			database: string;
		};
	};
	results: ScenarioResult[];
	witnesses: Record<string, JsonValue>;
	overall: {
		passed: boolean;
	};
};

const TORONTO_TZ = dispatchPolicy.timezone.toronto;

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

function getTorontoDateTimeInstant(
	dateString: string,
	options: { hours: number; minutes?: number; seconds?: number }
): Date {
	const hours = options.hours;
	const minutes = options.minutes ?? 0;
	const seconds = options.seconds ?? 0;
	const localDateTime = `${dateString}T${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
	return fromZonedTime(localDateTime, TORONTO_TZ);
}

function assertNightlyCronE2EEnabled(): void {
	if (process.env.NIGHTLY_CRON_E2E !== '1') {
		throw new Error(
			'Refusing to run destructive cron drill without NIGHTLY_CRON_E2E=1 (use: pnpm nightly:cron-e2e)'
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

	// Breadcrumb for responders.
	console.info(`[cron-e2e] Using ${hostname}/${database}`);

	return { hostname, database };
}

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

function getCurrentLockDeadline(nowToronto: Date): Date {
	const day = nowToronto.getDay();
	const daysUntilSunday = day === 0 ? 7 : 7 - day;
	const nextSunday = addDays(startOfDay(nowToronto), daysUntilSunday);
	const currentSunday = addDays(nextSunday, -7);
	return set(currentSunday, { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 });
}

function computeLockPreferencesTargetWeek(now: Date): {
	lockAt: Date;
	weekStart: string;
	weekEndExclusive: string;
} {
	const startedAt = now;
	const lockAt = getCurrentLockDeadline(toZonedTime(startedAt, TORONTO_TZ));
	const lockWeekStart = getWeekStart(lockAt);
	const targetWeekStart = addWeeks(lockWeekStart, 2);
	const targetWeekEndExclusive = addDays(targetWeekStart, 7);

	return {
		lockAt,
		weekStart: toTorontoDateString(targetWeekStart),
		weekEndExclusive: toTorontoDateString(targetWeekEndExclusive)
	};
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

async function acquireFileLock(lockFilePath: string): Promise<() => Promise<void>> {
	await fs.mkdir(path.dirname(lockFilePath), { recursive: true });
	let handle: fs.FileHandle | null = null;
	try {
		handle = await fs.open(lockFilePath, 'wx');
		await handle.writeFile(`pid=${process.pid}\nstartedAt=${new Date().toISOString()}\n`, 'utf8');
	} catch (err) {
		const message = String((err as any)?.message ?? err);
		throw new Error(
			`Cron E2E drill lock file already exists (${lockFilePath}). Another run may be in progress. (${message})`
		);
	}

	return async () => {
		try {
			await handle?.close();
		} finally {
			await fs.unlink(lockFilePath).catch(() => {});
		}
	};
}

async function invokeGet(params: {
	endpoint: string;
	get: (event: unknown) => Promise<Response>;
	cronSecret: string;
}): Promise<{ status: number; body: JsonValue }> {
	const event = createRequestEvent({
		method: 'GET',
		url: `http://localhost${params.endpoint}`,
		headers: {
			authorization: `Bearer ${params.cronSecret}`
		}
	});

	const response = await params.get(event as Parameters<typeof params.get>[0]);
	let body: JsonValue = null;
	try {
		body = (await response.json()) as JsonValue;
	} catch {
		body = null;
	}

	return { status: response.status, body };
}

async function getSeedOrgId(slug: string): Promise<string> {
	const rows = await withDbRetry(() =>
		db
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.slug, slug))
			.limit(1)
	);
	const row = (rows as Array<{ id: string }>)[0];
	if (!row) {
		throw new Error(`Seed organization not found: ${slug}`);
	}
	return row.id;
}

function getRows<T extends Record<string, unknown>>(result: unknown): T[] {
	const rows = (result as { rows?: unknown })?.rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
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
			'Nightly cron E2E drill lock is already held; aborting to avoid concurrent reseeds'
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

function summarizeInvariants(invariants: InvariantResult[]): {
	passed: boolean;
	failed: InvariantResult[];
} {
	const failed = invariants.filter((i) => !i.passed);
	return { passed: failed.length === 0, failed };
}

describe('nightly cron E2E drill (dev DB)', () => {
	it('reseeds, runs crons, and emits DB-evidence report', async () => {
		assertNightlyCronE2EEnabled();

		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error('Refusing to run: DATABASE_URL is not set');
		}
		const dbFingerprint = assertSafeDatabaseUrl(databaseUrl);

		const cronSecret = process.env.CRON_SECRET?.trim();
		if (!cronSecret) {
			throw new Error('Refusing to run: CRON_SECRET is not set (required for cron auth)');
		}

		const artifactDate = new Date().toISOString().slice(0, 10);
		const outDir = path.resolve(process.cwd(), 'logs', 'nightly', artifactDate);
		await fs.mkdir(outDir, { recursive: true });

		const seedValue = Number(process.env.CRON_E2E_SEED ?? '20260302');
		if (!Number.isFinite(seedValue)) {
			throw new Error('Invalid CRON_E2E_SEED (expected a number)');
		}

		const defaultAnchor = new Date().toISOString().slice(0, 10);
		const anchorDate = (process.env.CRON_E2E_ANCHOR_DATE ?? defaultAnchor).trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
			throw new Error('Invalid CRON_E2E_ANCHOR_DATE (expected YYYY-MM-DD)');
		}
		if (anchorDate < dispatchPolicy.confirmation.deploymentDate) {
			throw new Error(
				`Anchor date must be >= confirmation deployment date (${dispatchPolicy.confirmation.deploymentDate})`
			);
		}

		// 18:00 UTC = 1 PM EST (Feb) / 2 PM EDT — ensures ALL route start times
		// (up to 11:00 local) have passed for the no-show-detection scenario.
		const frozenNow = new Date(`${anchorDate}T18:00:00.000Z`);

		const report: CronE2EReport = {
			run: {
				artifactDate,
				startedAt: new Date().toISOString(),
				finishedAt: '',
				frozenNow: frozenNow.toISOString(),
				seed: {
					deterministic: true,
					seed: seedValue,
					anchorDate,
					command: `pnpm seed -- --deterministic --seed=${seedValue} --anchor-date=${anchorDate}`
				},
				database: dbFingerprint
			},
			results: [],
			witnesses: {},
			overall: { passed: false }
		};

		const seedLogPath = path.join(outDir, 'cron-e2e-seed.log');
		const dbPushLogPath = path.join(outDir, 'cron-e2e-db-push.log');
		const reportJsonPath = path.join(outDir, 'cron-e2e-report.json');
		const reportMdPath = path.join(outDir, 'cron-e2e-report.md');

		let releaseLock: (() => Promise<void>) | null = null;
		let releaseFileLock: (() => Promise<void>) | null = null;
		try {
			releaseFileLock = await acquireFileLock(path.join(outDir, 'cron-e2e.lock'));
			releaseLock = await acquireAdvisoryLock(databaseUrl);

			// Keep the shared dev DB schema in sync before reseeding.
			await runCommand({
				command: 'pnpm',
				args: ['exec', 'drizzle-kit', 'push', '--force'],
				logFilePath: dbPushLogPath
			});

			await runCommand({
				command: 'pnpm',
				args: [
					'seed',
					'--',
					'--deterministic',
					`--seed=${seedValue}`,
					`--anchor-date=${anchorDate}`
				],
				logFilePath: seedLogPath
			});

			// Create a fresh DB pool after destructive child-process steps.
			await closeDb();
			initDb(databaseUrl);

			freezeTime(frozenNow);
			await withDbRetry(() => db.execute(sql`select 1;`));

			const orgAId = await getSeedOrgId('seed-org-a');
			const orgBId = await getSeedOrgId('seed-org-b');
			report.witnesses.seedOrgs = { orgAId, orgBId };

			// Make schedule generation meaningful: cancel all pre-seeded assignments for the
			// lock-preferences target week so the cron can generate Week N+2 from scratch.
			const lockTarget = computeLockPreferencesTargetWeek(new Date());
			await db
				.update(assignments)
				.set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
				.where(
					and(
						gte(assignments.date, lockTarget.weekStart),
						lt(assignments.date, lockTarget.weekEndExclusive)
					)
				);

			// Import cron endpoints lazily (after reseed + clock freeze).
			const lockPreferences = await import('../../src/routes/api/cron/lock-preferences/+server');
			const sendConfirmationReminders =
				await import('../../src/routes/api/cron/send-confirmation-reminders/+server');
			const autoDropUnconfirmed =
				await import('../../src/routes/api/cron/auto-drop-unconfirmed/+server');
			const closeBidWindows = await import('../../src/routes/api/cron/close-bid-windows/+server');
			const noShowDetection = await import('../../src/routes/api/cron/no-show-detection/+server');
			const healthDaily = await import('../../src/routes/api/cron/health-daily/+server');
			const healthWeekly = await import('../../src/routes/api/cron/health-weekly/+server');

			// ---------------------------------------------------------------------
			// 1) lock-preferences
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/lock-preferences';
				const scenarioId = 'CRON-LOCK-PREFERENCES';

				const beforeAssignmentCount = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(assignments)
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled')
						)
					);

				const run1 = await invokeGet({ endpoint, get: lockPreferences.GET, cronSecret });
				const assignmentCountAfterRun1Rows = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(assignments)
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled')
						)
					);
				const assignmentCountAfterRun1 = assignmentCountAfterRun1Rows[0]?.count ?? 0;

				const assignmentConfirmedAfterRun1Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'assignment_confirmed'
						  and data ->> 'weekStart' = ${lockTarget.weekStart}
					`
				);
				const assignmentConfirmedAfterRun1 =
					getRows<{ count: number }>(assignmentConfirmedAfterRun1Rows)[0]?.count ?? 0;

				const run2 = await invokeGet({ endpoint, get: lockPreferences.GET, cronSecret });
				const assignmentCountAfterRun2Rows = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(assignments)
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled')
						)
					);
				const assignmentCountAfterRun2 = assignmentCountAfterRun2Rows[0]?.count ?? 0;

				const assignmentConfirmedAfterRun2Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'assignment_confirmed'
						  and data ->> 'weekStart' = ${lockTarget.weekStart}
					`
				);
				const assignmentConfirmedAfterRun2 =
					getRows<{ count: number }>(assignmentConfirmedAfterRun2Rows)[0]?.count ?? 0;

				const createdAssignments = await db
					.select({
						id: assignments.id,
						date: assignments.date,
						status: assignments.status,
						userId: assignments.userId,
						assignedBy: assignments.assignedBy
					})
					.from(assignments)
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled')
						)
					)
					.orderBy(assignments.date)
					.limit(50);

				const afterAssignmentCount = assignmentCountAfterRun1;
				const assignmentConfirmedCount = assignmentConfirmedAfterRun1;

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'LOCK-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'lock-preferences returns success'
				});
				invariants.push({
					invariantId: 'SCH-001',
					passed:
						afterAssignmentCount > 0 &&
						afterAssignmentCount >= (beforeAssignmentCount[0]?.count ?? 0),
					message: 'schedule generation produces non-cancelled Week N+2 assignments',
					evidence: {
						weekStart: lockTarget.weekStart,
						weekEndExclusive: lockTarget.weekEndExclusive,
						beforeNonCancelledCount: beforeAssignmentCount[0]?.count ?? 0,
						afterNonCancelledCount: afterAssignmentCount
					}
				});
				invariants.push({
					invariantId: 'SCH-002',
					passed: assignmentConfirmedCount > 0,
					message: 'assignment_confirmed notifications were created for the weekStart marker',
					evidence: { weekStart: lockTarget.weekStart, assignmentConfirmedCount }
				});

				// Tenant isolation: no assignment in Week N+2 is assigned cross-org.
				const crossOrgAssignmentRows = await db
					.select({ assignmentId: assignments.id })
					.from(assignments)
					.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
					.innerJoin(user, eq(assignments.userId, user.id))
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled'),
							isNotNull(assignments.userId),
							ne(user.organizationId, warehouses.organizationId)
						)
					)
					.limit(5);
				invariants.push({
					invariantId: 'TENANT-LOCK-001',
					passed: crossOrgAssignmentRows.length === 0,
					message: 'Week N+2 assignments remain org-scoped',
					evidence: {
						sampleViolationAssignmentIds: crossOrgAssignmentRows.map((r) => r.assignmentId)
					}
				});

				// Weekly caps: no driver exceeds weeklyCap for Week N+2.
				const capViolations = await db.execute(
					sql<{ user_id: string; weekly_cap: number; assignment_count: number }>`
						select a.user_id, u.weekly_cap, count(*)::int as assignment_count
						from assignments a
						join warehouses w on w.id = a.warehouse_id
						join "user" u on u.id = a.user_id
						where a.user_id is not null
						  and a.status <> 'cancelled'
						  and a.date >= ${lockTarget.weekStart}::date
						  and a.date < ${lockTarget.weekEndExclusive}::date
						group by a.user_id, u.weekly_cap
						having count(*) > u.weekly_cap
						limit 5
					`
				);
				const capViolationRows = getRows<{
					user_id: string;
					weekly_cap: number;
					assignment_count: number;
				}>(capViolations);
				invariants.push({
					invariantId: 'SCH-CAP-001',
					passed: capViolationRows.length === 0,
					message: 'Week N+2 per-driver assignments do not exceed weeklyCap',
					evidence: { sampleViolations: capViolationRows as unknown as JsonValue }
				});

				// Flagged drivers excluded.
				const flaggedAssignments = await db
					.select({ assignmentId: assignments.id })
					.from(assignments)
					.innerJoin(user, eq(assignments.userId, user.id))
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							ne(assignments.status, 'cancelled'),
							isNotNull(assignments.userId),
							eq(user.isFlagged, true)
						)
					)
					.limit(5);
				invariants.push({
					invariantId: 'SCH-FLAG-001',
					passed: flaggedAssignments.length === 0,
					message: 'Week N+2 has no assignments for flagged drivers',
					evidence: { sampleFlaggedAssignmentIds: flaggedAssignments.map((r) => r.assignmentId) }
				});

				invariants.push({
					invariantId: 'IDEMP-LOCK-001',
					passed: assignmentConfirmedAfterRun2 === assignmentConfirmedAfterRun1,
					message: 'lock-preferences rerun does not duplicate assignment_confirmed notifications',
					evidence: {
						afterRun1: assignmentConfirmedAfterRun1,
						afterRun2: assignmentConfirmedAfterRun2
					}
				});
				invariants.push({
					invariantId: 'IDEMP-LOCK-002',
					passed: true,
					message: 'placeholder (replaced below)'
				});

				// Idempotency: no duplicate assignment rows for the same route+date in the target week.
				const lockDupes = await db.execute(
					sql<{ route_id: string; date: string; row_count: number }>`
						select route_id, date, count(*)::int as row_count
						from assignments
						where status <> 'cancelled'
						  and date >= ${lockTarget.weekStart}::date
						  and date < ${lockTarget.weekEndExclusive}::date
						group by route_id, date
						having count(*) > 1
						limit 5
					`
				);
				const lockDupeRows = getRows<{ route_id: string; date: string; row_count: number }>(
					lockDupes
				);
				invariants[invariants.length - 1] = {
					invariantId: 'IDEMP-LOCK-002',
					passed: lockDupeRows.length === 0,
					message: 'lock-preferences rerun does not create duplicate route+date assignments',
					evidence: {
						afterRun1: assignmentCountAfterRun1,
						afterRun2: assignmentCountAfterRun2,
						sampleDupes: lockDupeRows as unknown as JsonValue
					}
				};

				// Witness: pick one scheduled assignment created in the target week.
				const witnessAssignment = await db
					.select({
						assignmentId: assignments.id,
						date: assignments.date,
						driverId: assignments.userId,
						routeId: assignments.routeId
					})
					.from(assignments)
					.where(
						and(
							gte(assignments.date, lockTarget.weekStart),
							lt(assignments.date, lockTarget.weekEndExclusive),
							eq(assignments.status, 'scheduled'),
							isNotNull(assignments.userId)
						)
					)
					.limit(1);

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: {
						orgAId,
						weekStart: lockTarget.weekStart,
						weekEndExclusive: lockTarget.weekEndExclusive,
						lockAt: lockTarget.lockAt.toISOString(),
						sampleAssignmentId: witnessAssignment[0]?.assignmentId ?? null,
						sampleDriverId: (witnessAssignment[0]?.driverId as string | null) ?? null
					}
				});

				report.witnesses.scheduleAssigned = witnessAssignment[0]
					? {
							orgId: orgAId,
							assignmentId: witnessAssignment[0].assignmentId,
							driverId: witnessAssignment[0].driverId,
							date: witnessAssignment[0].date,
							routeId: witnessAssignment[0].routeId,
							weekStart: lockTarget.weekStart
						}
					: null;
			}

			// ---------------------------------------------------------------------
			// 2) send-confirmation-reminders
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/send-confirmation-reminders';
				const scenarioId = 'CRON-SEND-CONFIRMATION-REMINDERS';

				const nowToronto = toZonedTime(new Date(), TORONTO_TZ);
				const targetDate = format(
					addDays(nowToronto, dispatchPolicy.confirmation.reminderLeadDays),
					'yyyy-MM-dd'
				);

				const candidates = await db
					.select({ assignmentId: assignments.id })
					.from(assignments)
					.innerJoin(warehouses, eq(warehouses.id, assignments.warehouseId))
					.where(
						and(
							eq(warehouses.organizationId, orgAId),
							eq(assignments.date, targetDate),
							eq(assignments.status, 'scheduled'),
							isNotNull(assignments.userId),
							isNull(assignments.confirmedAt),
							gte(assignments.date, dispatchPolicy.confirmation.deploymentDate)
						)
					);

				const run1 = await invokeGet({ endpoint, get: sendConfirmationReminders.GET, cronSecret });
				const countAfterRun1Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'confirmation_reminder'
						  and data ->> 'date' = ${targetDate}
						  and data ->> 'dedupeKey' is not null
					`
				);
				const countAfterRun1 = getRows<{ count: number }>(countAfterRun1Rows)[0]?.count ?? 0;

				const run2 = await invokeGet({ endpoint, get: sendConfirmationReminders.GET, cronSecret });
				const countAfterRun2Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'confirmation_reminder'
						  and data ->> 'date' = ${targetDate}
						  and data ->> 'dedupeKey' is not null
					`
				);
				const countAfterRun2 = getRows<{ count: number }>(countAfterRun2Rows)[0]?.count ?? 0;

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'REM-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'send-confirmation-reminders returns success'
				});
				invariants.push({
					invariantId: 'REM-002',
					passed: candidates.length > 0,
					message: 'seed produced unconfirmed scheduled assignments on target date',
					evidence: { targetDate, candidateCount: candidates.length }
				});
				invariants.push({
					invariantId: 'REM-003',
					passed: countAfterRun1 > 0,
					message: 'confirmation_reminder notifications were created (cron-shaped rows)',
					evidence: { targetDate, createdCount: countAfterRun1 }
				});
				invariants.push({
					invariantId: 'IDEMP-REM-001',
					passed: countAfterRun2 === countAfterRun1,
					message: 'send-confirmation-reminders rerun does not duplicate reminders',
					evidence: { afterRun1: countAfterRun1, afterRun2: countAfterRun2 }
				});

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: {
						orgAId,
						targetDate,
						candidateAssignmentIds: candidates.slice(0, 5).map((c) => c.assignmentId)
					}
				});
			}

			// ---------------------------------------------------------------------
			// 3) auto-drop-unconfirmed
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/auto-drop-unconfirmed';
				const scenarioId = 'CRON-AUTO-DROP-UNCONFIRMED';

				// Capture org-a candidates that are actually past the 48h confirmation deadline.
				const potentialCandidates = await db
					.select({
						assignmentId: assignments.id,
						date: assignments.date,
						userId: assignments.userId
					})
					.from(assignments)
					.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
					.leftJoin(
						bidWindows,
						and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.status, 'open'))
					)
					.where(
						and(
							eq(warehouses.organizationId, orgAId),
							eq(assignments.status, 'scheduled'),
							isNotNull(assignments.userId),
							isNull(assignments.confirmedAt),
							gte(assignments.date, dispatchPolicy.confirmation.deploymentDate),
							isNull(bidWindows.id)
						)
					)
					.limit(250);

				const now = new Date();
				const deadlineCandidates = potentialCandidates.filter((c) => {
					const shiftStart = getTorontoDateTimeInstant(c.date, {
						hours: dispatchPolicy.shifts.startHourLocal
					});
					const hoursUntilShift = (shiftStart.getTime() - now.getTime()) / (1000 * 60 * 60);
					return (
						hoursUntilShift >= 0 &&
						hoursUntilShift <= dispatchPolicy.confirmation.deadlineHoursBeforeShift
					);
				});
				let candidateAssignmentIds = deadlineCandidates.map((c) => c.assignmentId).slice(0, 25);

				// Prime: if the seed didn't naturally produce an eligible assignment,
				// move one eligible scheduled assignment into the deadline window.
				if (candidateAssignmentIds.length === 0 && potentialCandidates.length > 0) {
					const tomorrow = toTorontoDateString(addDays(new Date(), 1));
					await db
						.update(assignments)
						.set({ date: tomorrow, updatedAt: new Date() })
						.where(eq(assignments.id, potentialCandidates[0].assignmentId));

					const refreshed = await db
						.select({
							assignmentId: assignments.id,
							date: assignments.date,
							userId: assignments.userId
						})
						.from(assignments)
						.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
						.leftJoin(
							bidWindows,
							and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.status, 'open'))
						)
						.where(
							and(
								eq(warehouses.organizationId, orgAId),
								eq(assignments.status, 'scheduled'),
								isNotNull(assignments.userId),
								isNull(assignments.confirmedAt),
								gte(assignments.date, dispatchPolicy.confirmation.deploymentDate),
								isNull(bidWindows.id)
							)
						)
						.limit(250);

					const refreshedDeadlineCandidates = refreshed.filter((c) => {
						const shiftStart = getTorontoDateTimeInstant(c.date, {
							hours: dispatchPolicy.shifts.startHourLocal
						});
						const hoursUntilShift = (shiftStart.getTime() - now.getTime()) / (1000 * 60 * 60);
						return (
							hoursUntilShift >= 0 &&
							hoursUntilShift <= dispatchPolicy.confirmation.deadlineHoursBeforeShift
						);
					});
					candidateAssignmentIds = refreshedDeadlineCandidates
						.map((c) => c.assignmentId)
						.slice(0, 25);
				}

				const shiftAutoDroppedBeforeRows =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({ id: notifications.id })
								.from(notifications)
								.where(
									and(
										eq(notifications.type, 'shift_auto_dropped'),
										inArray(
											sql<string>`${notifications.data} ->> 'assignmentId'`,
											candidateAssignmentIds
										)
									)
								);
				const shiftAutoDroppedBefore = shiftAutoDroppedBeforeRows.length;

				const run1 = await invokeGet({ endpoint, get: autoDropUnconfirmed.GET, cronSecret });

				const windowsAfterRun1 =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({
									id: bidWindows.id,
									assignmentId: bidWindows.assignmentId,
									status: bidWindows.status
								})
								.from(bidWindows)
								.where(
									and(
										eq(bidWindows.trigger, 'auto_drop'),
										eq(bidWindows.status, 'open'),
										inArray(bidWindows.assignmentId, candidateAssignmentIds)
									)
								)
								.limit(10);

				const shiftAutoDroppedAfterRun1Rows =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({ id: notifications.id })
								.from(notifications)
								.where(
									and(
										eq(notifications.type, 'shift_auto_dropped'),
										inArray(
											sql<string>`${notifications.data} ->> 'assignmentId'`,
											candidateAssignmentIds
										)
									)
								);
				const shiftAutoDroppedAfterRun1 = shiftAutoDroppedAfterRun1Rows.length;

				const run2 = await invokeGet({ endpoint, get: autoDropUnconfirmed.GET, cronSecret });

				const windowsAfterRun2 =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({
									id: bidWindows.id,
									assignmentId: bidWindows.assignmentId,
									status: bidWindows.status
								})
								.from(bidWindows)
								.where(
									and(
										eq(bidWindows.trigger, 'auto_drop'),
										eq(bidWindows.status, 'open'),
										inArray(bidWindows.assignmentId, candidateAssignmentIds)
									)
								)
								.limit(10);

				const shiftAutoDroppedAfterRun2Rows =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({ id: notifications.id })
								.from(notifications)
								.where(
									and(
										eq(notifications.type, 'shift_auto_dropped'),
										inArray(
											sql<string>`${notifications.data} ->> 'assignmentId'`,
											candidateAssignmentIds
										)
									)
								);
				const shiftAutoDroppedAfterRun2 = shiftAutoDroppedAfterRun2Rows.length;

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'DROP-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'auto-drop-unconfirmed returns success'
				});
				invariants.push({
					invariantId: 'DROP-002',
					passed: candidateAssignmentIds.length > 0,
					message: 'seed produced at least one org-a assignment eligible for auto-drop',
					evidence: {
						candidateCount: deadlineCandidates.length,
						sampleCandidateAssignmentIds: candidateAssignmentIds
					}
				});
				invariants.push({
					invariantId: 'DROP-003',
					passed: windowsAfterRun1.length > 0,
					message:
						'auto-drop created open bid windows for eligible assignments (trigger=auto_drop)',
					evidence: {
						sampleWindowIds: windowsAfterRun1.slice(0, 3).map((w) => w.id),
						sampleAssignmentIds: windowsAfterRun1.slice(0, 3).map((w) => w.assignmentId)
					}
				});
				invariants.push({
					invariantId: 'DROP-004',
					passed: shiftAutoDroppedAfterRun1 > shiftAutoDroppedBefore,
					message: 'auto-drop created shift_auto_dropped notifications for eligible assignments',
					evidence: {
						before: shiftAutoDroppedBefore,
						afterRun1: shiftAutoDroppedAfterRun1
					}
				});

				// Verify windows are not duplicated by rerun (unique open window per assignment).
				const openAutoDropDupes = await db.execute(
					sql<{ assignment_id: string; open_count: number }>`
						select assignment_id, count(*)::int as open_count
						from bid_windows
						where trigger = 'auto_drop' and status = 'open'
						group by assignment_id
						having count(*) > 1
						limit 5
					`
				);
				const openAutoDropDupeRows = getRows<{ assignment_id: string; open_count: number }>(
					openAutoDropDupes
				);
				invariants.push({
					invariantId: 'IDEMP-DROP-001',
					passed: openAutoDropDupeRows.length === 0,
					message: 'auto-drop rerun does not create multiple open windows per assignment',
					evidence: { sampleDupes: openAutoDropDupeRows as unknown as JsonValue }
				});
				invariants.push({
					invariantId: 'IDEMP-DROP-002',
					passed: shiftAutoDroppedAfterRun2 === shiftAutoDroppedAfterRun1,
					message: 'auto-drop rerun does not duplicate shift_auto_dropped notifications',
					evidence: {
						afterRun1: shiftAutoDroppedAfterRun1,
						afterRun2: shiftAutoDroppedAfterRun2
					}
				});
				invariants.push({
					invariantId: 'IDEMP-DROP-003',
					passed: windowsAfterRun2.length === windowsAfterRun1.length,
					message: 'auto-drop rerun does not create extra open windows (scoped to candidates)',
					evidence: { afterRun1: windowsAfterRun1.length, afterRun2: windowsAfterRun2.length }
				});

				// Witness: pick one auto-drop assignment and link to notification + original driver.
				const witnessWindow = windowsAfterRun1[0];
				let witnessAutoDrop: JsonValue = null;
				if (witnessWindow) {
					const [assignment] = await db
						.select({
							status: assignments.status,
							cancelType: assignments.cancelType,
							userId: assignments.userId
						})
						.from(assignments)
						.where(eq(assignments.id, witnessWindow.assignmentId))
						.limit(1);

					const notif = await db
						.select({ id: notifications.id, userId: notifications.userId })
						.from(notifications)
						.where(
							and(
								eq(notifications.type, 'shift_auto_dropped'),
								sql`${notifications.data} ->> 'assignmentId' = ${witnessWindow.assignmentId}`
							)
						)
						.orderBy(desc(notifications.createdAt))
						.limit(1);

					witnessAutoDrop = {
						bidWindowId: witnessWindow.id,
						assignmentId: witnessWindow.assignmentId,
						originalDriverId: notif[0]?.userId ?? null,
						shiftAutoDroppedNotificationId: notif[0]?.id ?? null,
						assignmentStatus: assignment?.status ?? null,
						assignmentCancelType: assignment?.cancelType ?? null,
						assignmentUserId: assignment?.userId ?? null
					};
				}

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: witnessWindow
						? {
								bidWindowId: witnessWindow.id,
								assignmentId: witnessWindow.assignmentId
							}
						: {}
				});

				report.witnesses.autoDropped = witnessAutoDrop;
			}

			// ---------------------------------------------------------------------
			// 4) close-bid-windows
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/close-bid-windows';
				const scenarioId = 'CRON-CLOSE-BID-WINDOWS';

				// Prime: force at least one competitive window (with bids) to be expired/open
				// so resolution-with-winner is deterministic.
				const now = new Date();
				const primed = await db.execute(
					sql<{ window_id: string }>`
						select bw.id as window_id
						from bid_windows bw
						join bids b on b.bid_window_id = bw.id
						join assignments a on a.id = bw.assignment_id
						join warehouses w on w.id = a.warehouse_id
						where w.organization_id = ${orgAId}
						  and bw.status = 'open'
						  and bw.mode = 'competitive'
						group by bw.id
						having count(*) >= 2
						limit 1
					`
				);
				const primedWindowId = getRows<{ window_id: string }>(primed)[0]?.window_id ?? null;
				if (primedWindowId) {
					await db
						.update(bidWindows)
						.set({ closesAt: new Date(now.getTime() - 60_000) })
						.where(eq(bidWindows.id, primedWindowId));
				}

				const expiredOpenBefore = await db
					.select({ id: bidWindows.id })
					.from(bidWindows)
					.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
					.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
					.where(
						and(
							eq(bidWindows.status, 'open'),
							lt(bidWindows.closesAt, new Date()),
							eq(warehouses.organizationId, orgAId)
						)
					)
					.limit(25);
				const expiredOpenIds = expiredOpenBefore.map((w) => w.id);

				const run1 = await invokeGet({ endpoint, get: closeBidWindows.GET, cronSecret });

				// Pick one resolved window with bids as a witness (after run1).
				const resolvedWindowAfterRun1 =
					expiredOpenIds.length === 0
						? []
						: await db
								.select({
									windowId: bidWindows.id,
									assignmentId: bidWindows.assignmentId,
									winnerId: bidWindows.winnerId
								})
								.from(bidWindows)
								.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
								.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
								.where(
									and(
										inArray(bidWindows.id, expiredOpenIds),
										eq(warehouses.organizationId, orgAId),
										eq(bidWindows.status, 'resolved'),
										isNotNull(bidWindows.winnerId)
									)
								)
								.orderBy(desc(bidWindows.closesAt))
								.limit(1);

				// Capture notif totals after run1 for idempotency.
				let bidNotifsAfterRun1: { won_count: number; lost_count: number } | null = null;
				if (resolvedWindowAfterRun1[0]) {
					const windowId = resolvedWindowAfterRun1[0].windowId;
					const notifCountsAfterRun1 = await db.execute(
						sql<{ won_count: number; lost_count: number }>`
							select
								sum(case when type = 'bid_won' then 1 else 0 end)::int as won_count,
								sum(case when type = 'bid_lost' then 1 else 0 end)::int as lost_count
							from notifications
							where (type = 'bid_won' or type = 'bid_lost')
							  and data ->> 'bidWindowId' = ${windowId}
					`
					);
					bidNotifsAfterRun1 =
						getRows<{ won_count: number; lost_count: number }>(notifCountsAfterRun1)[0] ?? null;
				}

				const run2 = await invokeGet({ endpoint, get: closeBidWindows.GET, cronSecret });

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'BID-CLOSE-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'close-bid-windows returns success'
				});
				invariants.push({
					invariantId: 'BID-CLOSE-002',
					passed: expiredOpenBefore.length > 0,
					message: 'seed produced at least one expired open bid window for org-a',
					evidence: { expiredOpenBeforeCount: expiredOpenBefore.length }
				});
				invariants.push({
					invariantId: 'BID-RESOLVE-001',
					passed: resolvedWindowAfterRun1.length > 0,
					message: 'at least one bid window resolved with a winner',
					evidence: resolvedWindowAfterRun1[0]
						? {
								bidWindowId: resolvedWindowAfterRun1[0].windowId,
								assignmentId: resolvedWindowAfterRun1[0].assignmentId,
								winnerId: resolvedWindowAfterRun1[0].winnerId
							}
						: null
				});

				let witnessBidResolution: JsonValue = null;
				if (resolvedWindowAfterRun1[0]) {
					const windowId = resolvedWindowAfterRun1[0].windowId;
					const assignmentId = resolvedWindowAfterRun1[0].assignmentId;
					const winnerId = resolvedWindowAfterRun1[0].winnerId as string;

					const bidRows = await db
						.select({ id: bids.id, userId: bids.userId, status: bids.status })
						.from(bids)
						.where(eq(bids.bidWindowId, windowId));

					const wonCount = bidRows.filter((b) => b.status === 'won').length;
					const lostCount = bidRows.filter((b) => b.status === 'lost').length;
					invariants.push({
						invariantId: 'BID-RESOLVE-002',
						passed: wonCount === 1,
						message: 'resolved bid window has exactly one winning bid',
						evidence: { windowId, wonCount, lostCount, bidCount: bidRows.length }
					});

					const [assignment] = await db
						.select({
							assignedBy: assignments.assignedBy,
							userId: assignments.userId,
							status: assignments.status
						})
						.from(assignments)
						.where(eq(assignments.id, assignmentId))
						.limit(1);
					invariants.push({
						invariantId: 'BID-RESOLVE-003',
						passed: assignment?.assignedBy === 'bid' && assignment?.userId === winnerId,
						message: "winner assignment reflects assignedBy='bid'",
						evidence: {
							assignmentId,
							assignedBy: assignment?.assignedBy ?? null,
							assignedUserId: assignment?.userId ?? null,
							winnerId
						}
					});

					const notifRow = bidNotifsAfterRun1 ?? { won_count: 0, lost_count: 0 };
					invariants.push({
						invariantId: 'BID-NOTIF-001',
						passed: notifRow.won_count >= 1 && notifRow.lost_count >= 1,
						message: 'winner/loser notifications exist for resolved window',
						evidence: { windowId, ...notifRow }
					});

					// Idempotency: rerun should not create more notifications for the same window.
					const notifCounts2 = await db.execute(
						sql<{ count: number }>`
							select count(*)::int as count
							from notifications
							where (type = 'bid_won' or type = 'bid_lost')
							  and data ->> 'bidWindowId' = ${windowId}
					`
					);
					const notifTotalAfterRun2 = getRows<{ count: number }>(notifCounts2)[0]?.count ?? 0;
					const notifTotalAfterRun1 = notifRow.won_count + notifRow.lost_count;
					invariants.push({
						invariantId: 'IDEMP-BID-001',
						passed: notifTotalAfterRun2 === notifTotalAfterRun1,
						message: 'close-bid-windows rerun does not duplicate bid_won/bid_lost notifications',
						evidence: { windowId, afterRun1: notifTotalAfterRun1, afterRun2: notifTotalAfterRun2 }
					});

					const loserIds = bidRows.filter((b) => b.status === 'lost').map((b) => b.userId);
					witnessBidResolution = {
						bidWindowId: windowId,
						assignmentId,
						winnerId,
						loserIds
					};
				}

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: resolvedWindowAfterRun1[0]
						? {
								bidWindowId: resolvedWindowAfterRun1[0].windowId,
								assignmentId: resolvedWindowAfterRun1[0].assignmentId,
								winnerId: resolvedWindowAfterRun1[0].winnerId
							}
						: {}
				});

				report.witnesses.bidResolution = witnessBidResolution;
			}

			// ---------------------------------------------------------------------
			// 5) no-show-detection
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/no-show-detection';
				const scenarioId = 'CRON-NO-SHOW-DETECTION';
				const today = toTorontoDateString(new Date());
				const nowToronto = toZonedTime(new Date(), TORONTO_TZ);

				// Find at least one confirmed-but-not-arrived scheduled assignment for today
				// where the route deadline has already passed.
				const candidateRows = await db
					.select({
						assignmentId: assignments.id,
						routeId: assignments.routeId,
						driverId: assignments.userId,
						routeStartTime: routes.startTime,
						orgId: warehouses.organizationId
					})
					.from(assignments)
					.innerJoin(routes, eq(assignments.routeId, routes.id))
					.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
					.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
					.leftJoin(driverMetrics, eq(driverMetrics.userId, assignments.userId))
					.leftJoin(driverHealthState, eq(driverHealthState.userId, assignments.userId))
					.leftJoin(
						bidWindows,
						and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.status, 'open'))
					)
					.where(
						and(
							eq(warehouses.organizationId, orgAId),
							eq(assignments.date, today),
							eq(assignments.status, 'scheduled'),
							isNotNull(assignments.userId),
							isNotNull(assignments.confirmedAt),
							isNull(shifts.arrivedAt),
							isNull(bidWindows.id)
						)
					)
					.limit(50);

				let candidates = candidateRows.filter((c) => {
					const { hours, minutes } = parseRouteStartTime(c.routeStartTime || null);
					const deadline = getTorontoDateTimeInstant(today, { hours, minutes });
					return nowToronto >= deadline;
				});
				let candidateAssignmentIds = candidates.map((c) => c.assignmentId).slice(0, 25);

				// Prime: if no natural candidates, confirm one scheduled assignment for today
				// (past its route deadline) so no-show detection has something to act on.
				if (candidateAssignmentIds.length === 0) {
					const primable = await db
						.select({
							assignmentId: assignments.id,
							routeStartTime: routes.startTime
						})
						.from(assignments)
						.innerJoin(routes, eq(assignments.routeId, routes.id))
						.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
						.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
						.leftJoin(
							bidWindows,
							and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.status, 'open'))
						)
						.where(
							and(
								eq(warehouses.organizationId, orgAId),
								eq(assignments.date, today),
								eq(assignments.status, 'scheduled'),
								isNotNull(assignments.userId),
								isNull(assignments.confirmedAt),
								isNull(shifts.arrivedAt),
								isNull(bidWindows.id)
							)
						)
						.limit(25);

					const primablePastDeadline = primable.find((p) => {
						const { hours, minutes } = parseRouteStartTime(p.routeStartTime || null);
						const deadline = getTorontoDateTimeInstant(today, { hours, minutes });
						return nowToronto >= deadline;
					});

					if (primablePastDeadline) {
						await db
							.update(assignments)
							.set({ confirmedAt: new Date(), updatedAt: new Date() })
							.where(eq(assignments.id, primablePastDeadline.assignmentId));

						const refreshedRows = await db
							.select({
								assignmentId: assignments.id,
								routeId: assignments.routeId,
								driverId: assignments.userId,
								routeStartTime: routes.startTime,
								orgId: warehouses.organizationId
							})
							.from(assignments)
							.innerJoin(routes, eq(assignments.routeId, routes.id))
							.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
							.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
							.leftJoin(driverMetrics, eq(driverMetrics.userId, assignments.userId))
							.leftJoin(driverHealthState, eq(driverHealthState.userId, assignments.userId))
							.leftJoin(
								bidWindows,
								and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.status, 'open'))
							)
							.where(
								and(
									eq(warehouses.organizationId, orgAId),
									eq(assignments.date, today),
									eq(assignments.status, 'scheduled'),
									isNotNull(assignments.userId),
									isNotNull(assignments.confirmedAt),
									isNull(shifts.arrivedAt),
									isNull(bidWindows.id)
								)
							)
							.limit(50);

						candidates = refreshedRows.filter((c) => {
							const { hours, minutes } = parseRouteStartTime(c.routeStartTime || null);
							const deadline = getTorontoDateTimeInstant(today, { hours, minutes });
							return nowToronto >= deadline;
						});
						candidateAssignmentIds = candidates.map((c) => c.assignmentId).slice(0, 25);
					}
				}

				const managerAlertsBeforeRows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'driver_no_show'
						  and organization_id = ${orgAId}
						  and data ->> 'date' = ${today}
					`
				);
				const managerAlertsBefore =
					getRows<{ count: number }>(managerAlertsBeforeRows)[0]?.count ?? 0;

				const run1 = await invokeGet({ endpoint, get: noShowDetection.GET, cronSecret });
				const windowsAfterRun1 =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({ id: bidWindows.id, assignmentId: bidWindows.assignmentId })
								.from(bidWindows)
								.where(
									and(
										eq(bidWindows.trigger, 'no_show'),
										eq(bidWindows.status, 'open'),
										inArray(bidWindows.assignmentId, candidateAssignmentIds)
									)
								)
								.limit(10);

				const managerAlertsAfterRun1Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'driver_no_show'
						  and organization_id = ${orgAId}
						  and data ->> 'date' = ${today}
					`
				);
				const managerAlertsAfterRun1 =
					getRows<{ count: number }>(managerAlertsAfterRun1Rows)[0]?.count ?? 0;

				const run2 = await invokeGet({ endpoint, get: noShowDetection.GET, cronSecret });
				const windowsAfterRun2 =
					candidateAssignmentIds.length === 0
						? []
						: await db
								.select({ id: bidWindows.id, assignmentId: bidWindows.assignmentId })
								.from(bidWindows)
								.where(
									and(
										eq(bidWindows.trigger, 'no_show'),
										eq(bidWindows.status, 'open'),
										inArray(bidWindows.assignmentId, candidateAssignmentIds)
									)
								)
								.limit(10);

				const managerAlertsAfterRun2Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from notifications
						where type = 'driver_no_show'
						  and organization_id = ${orgAId}
						  and data ->> 'date' = ${today}
					`
				);
				const managerAlertsAfterRun2 =
					getRows<{ count: number }>(managerAlertsAfterRun2Rows)[0]?.count ?? 0;

				// DB evidence: link the newest manager alert to its no-show bid window.
				const [latestAlert] = await db
					.select({
						notificationId: notifications.id,
						routeId: sql<string>`${notifications.data} ->> 'routeId'`
					})
					.from(notifications)
					.where(
						and(
							eq(notifications.type, 'driver_no_show'),
							eq(notifications.organizationId, orgAId),
							sql`${notifications.data} ->> 'date' = ${today}`
						)
					)
					.orderBy(desc(notifications.createdAt))
					.limit(1);

				let witnessNoShowWindowId: string | null = null;
				if (latestAlert?.routeId) {
					const [a] = await db
						.select({ id: assignments.id })
						.from(assignments)
						.where(and(eq(assignments.routeId, latestAlert.routeId), eq(assignments.date, today)))
						.limit(1);

					if (a?.id) {
						const [w] = await db
							.select({ id: bidWindows.id })
							.from(bidWindows)
							.where(
								and(
									eq(bidWindows.assignmentId, a.id),
									eq(bidWindows.trigger, 'no_show'),
									eq(bidWindows.status, 'open')
								)
							)
							.limit(1);
						witnessNoShowWindowId = w?.id ?? null;
					}
				}

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'NOS-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'no-show-detection returns success'
				});
				invariants.push({
					invariantId: 'NOS-002',
					passed: (run1.body as any)?.bidWindowsCreated > 0,
					message: 'no-show-detection reports at least one bid window created',
					evidence: { bidWindowsCreated: (run1.body as any)?.bidWindowsCreated ?? null }
				});
				invariants.push({
					invariantId: 'NOS-003',
					passed: witnessNoShowWindowId !== null,
					message:
						'no-show manager alert links to an open no_show bid window for the same route/date',
					evidence: {
						latestAlertNotificationId: latestAlert?.notificationId ?? null,
						routeId: latestAlert?.routeId ?? null,
						witnessNoShowWindowId
					}
				});
				invariants.push({
					invariantId: 'NOS-MGR-000',
					passed: managerAlertsAfterRun1 > managerAlertsBefore,
					message:
						'no-show-detection created at least one manager alert (driver_no_show) for today (org-a)',
					evidence: {
						before: managerAlertsBefore,
						afterRun1: managerAlertsAfterRun1,
						afterRun2: managerAlertsAfterRun2
					}
				});

				// Idempotency: at most one open window per assignment.
				const noShowDupes = await db.execute(
					sql<{ assignment_id: string; open_count: number }>`
						select assignment_id, count(*)::int as open_count
						from bid_windows
						where trigger = 'no_show' and status = 'open'
						group by assignment_id
						having count(*) > 1
						limit 5
					`
				);
				const noShowDupeRows = getRows<{ assignment_id: string; open_count: number }>(noShowDupes);
				invariants.push({
					invariantId: 'IDEMP-NOS-001',
					passed: noShowDupeRows.length === 0,
					message: 'no-show-detection rerun does not create duplicate open windows',
					evidence: { sampleDupes: noShowDupeRows as unknown as JsonValue }
				});
				invariants.push({
					invariantId: 'IDEMP-NOS-002',
					passed: windowsAfterRun2.length === windowsAfterRun1.length,
					message: 'no-show-detection rerun does not create extra candidate windows',
					evidence: { afterRun1: windowsAfterRun1.length, afterRun2: windowsAfterRun2.length }
				});
				invariants.push({
					invariantId: 'IDEMP-NOS-003',
					passed: managerAlertsAfterRun2 === managerAlertsAfterRun1,
					message: 'no-show-detection rerun does not duplicate manager alerts',
					evidence: { afterRun1: managerAlertsAfterRun1, afterRun2: managerAlertsAfterRun2 }
				});

				// Witness: one driver_no_show manager alert (requires routes.managerId seeded).
				const managerAlerts = await db
					.select({ id: notifications.id, userId: notifications.userId })
					.from(notifications)
					.where(
						and(
							eq(notifications.type, 'driver_no_show'),
							eq(notifications.organizationId, orgAId),
							sql`${notifications.data} ->> 'date' = ${today}`
						)
					)
					.orderBy(desc(notifications.createdAt))
					.limit(1);

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: {
						day: today,
						sampleManagerId: managerAlerts[0]?.userId ?? null,
						sampleManagerNotificationId: managerAlerts[0]?.id ?? null
					}
				});

				report.witnesses.noShowManager = managerAlerts[0]
					? {
							date: today,
							managerId: managerAlerts[0].userId,
							notificationId: managerAlerts[0].id
						}
					: null;
			}

			// ---------------------------------------------------------------------
			// 6) health-daily
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/health-daily';
				const scenarioId = 'CRON-HEALTH-DAILY';
				const today = toTorontoDateString(new Date());

				const beforeSnapshots = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(driverHealthSnapshots)
					.where(eq(driverHealthSnapshots.evaluatedAt, today));

				const run1 = await invokeGet({ endpoint, get: healthDaily.GET, cronSecret });
				const afterRun1Snapshots = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(driverHealthSnapshots)
					.where(eq(driverHealthSnapshots.evaluatedAt, today));

				const run2 = await invokeGet({ endpoint, get: healthDaily.GET, cronSecret });
				const afterRun2Snapshots = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(driverHealthSnapshots)
					.where(eq(driverHealthSnapshots.evaluatedAt, today));

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'HLT-D-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'health-daily returns success'
				});
				invariants.push({
					invariantId: 'HLT-D-002',
					passed: (afterRun1Snapshots[0]?.count ?? 0) > 0,
					message: 'health-daily ensured snapshots exist for evaluatedAt=today',
					evidence: {
						today,
						beforeCount: beforeSnapshots[0]?.count ?? 0,
						afterRun1: afterRun1Snapshots[0]?.count ?? 0
					}
				});
				invariants.push({
					invariantId: 'IDEMP-HLT-D-001',
					passed: (afterRun2Snapshots[0]?.count ?? 0) === (afterRun1Snapshots[0]?.count ?? 0),
					message: 'health-daily rerun does not create duplicate snapshots',
					evidence: {
						afterRun1: afterRun1Snapshots[0]?.count ?? 0,
						afterRun2: afterRun2Snapshots[0]?.count ?? 0
					}
				});

				report.results.push({
					scenarioId,
					endpoint,
					run1,
					run2,
					invariants,
					keyEntityIds: { today }
				});
			}

			// ---------------------------------------------------------------------
			// 7) health-weekly
			// ---------------------------------------------------------------------
			{
				const endpoint = '/api/cron/health-weekly';
				const scenarioId = 'CRON-HEALTH-WEEKLY';
				const nowIso = new Date().toISOString();

				const beforeEligible = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(driverHealthState)
					.where(eq(driverHealthState.assignmentPoolEligible, true));

				const updatedAtBeforeRows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from driver_health_state hs
						join "user" u on u.id = hs.user_id
						where u.organization_id = ${orgAId}
						  and hs.updated_at = ${nowIso}::timestamptz
					`
				);
				const updatedAtBefore = getRows<{ count: number }>(updatedAtBeforeRows)[0]?.count ?? 0;

				const run1 = await invokeGet({ endpoint, get: healthWeekly.GET, cronSecret });

				const updatedAtAfterRun1Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from driver_health_state hs
						join "user" u on u.id = hs.user_id
						where u.organization_id = ${orgAId}
						  and hs.updated_at = ${nowIso}::timestamptz
					`
				);
				const updatedAtAfterRun1 =
					getRows<{ count: number }>(updatedAtAfterRun1Rows)[0]?.count ?? 0;

				const run2 = await invokeGet({ endpoint, get: healthWeekly.GET, cronSecret });

				const updatedAtAfterRun2Rows = await db.execute(
					sql<{ count: number }>`
						select count(*)::int as count
						from driver_health_state hs
						join "user" u on u.id = hs.user_id
						where u.organization_id = ${orgAId}
						  and hs.updated_at = ${nowIso}::timestamptz
					`
				);
				const updatedAtAfterRun2 =
					getRows<{ count: number }>(updatedAtAfterRun2Rows)[0]?.count ?? 0;

				const afterEligible = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(driverHealthState)
					.where(eq(driverHealthState.assignmentPoolEligible, true));

				const invariants: InvariantResult[] = [];
				invariants.push({
					invariantId: 'HLT-W-001',
					passed: run1.status === 200 && (run1.body as any)?.success === true,
					message: 'health-weekly returns success'
				});
				invariants.push({
					invariantId: 'HLT-W-002',
					passed: (beforeEligible[0]?.count ?? 0) > 0 && (afterEligible[0]?.count ?? 0) >= 0,
					message: 'health-weekly executed against seeded health state',
					evidence: {
						eligibleBefore: beforeEligible[0]?.count ?? 0,
						eligibleAfter: afterEligible[0]?.count ?? 0
					}
				});
				invariants.push({
					invariantId: 'HLT-W-003',
					passed: updatedAtAfterRun1 > 0 && updatedAtAfterRun1 >= updatedAtBefore,
					message: 'health-weekly upserted driver_health_state rows (org-a scoped)',
					evidence: {
						updatedAt: nowIso,
						before: updatedAtBefore,
						afterRun1: updatedAtAfterRun1
					}
				});
				invariants.push({
					invariantId: 'IDEMP-HLT-W-001',
					passed: updatedAtAfterRun2 === updatedAtAfterRun1,
					message: 'health-weekly rerun is idempotent for state upserts at frozen now',
					evidence: {
						afterRun1: updatedAtAfterRun1,
						afterRun2: updatedAtAfterRun2
					}
				});

				report.results.push({ scenarioId, endpoint, run1, run2, invariants });
			}

			report.overall.passed = report.results.every(
				(r) =>
					summarizeInvariants(r.invariants).passed && r.run1.status === 200 && r.run2.status === 200
			);
		} finally {
			report.run.finishedAt = new Date().toISOString();
			resetTime();
			if (releaseLock) {
				await releaseLock();
			}
			await closeDb();
			if (releaseFileLock) {
				await releaseFileLock();
			}

			// Always write artifacts (even on failure).
			await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

			const lines: string[] = [];
			lines.push(`# Cron E2E Report`);
			lines.push('');
			lines.push(`Artifact date: ${report.run.artifactDate}`);
			lines.push(`Frozen now: ${report.run.frozenNow}`);
			lines.push(
				`Seed: deterministic seed=${report.run.seed.seed} anchorDate=${report.run.seed.anchorDate}`
			);
			lines.push(`DB: ${report.run.database.hostname}/${report.run.database.database}`);
			lines.push('');
			lines.push(`Overall: ${report.overall.passed ? 'PASS' : 'FAIL'}`);
			lines.push('');
			lines.push('## Results');
			for (const result of report.results) {
				const { passed } = summarizeInvariants(result.invariants);
				lines.push(
					`- ${result.endpoint}: ${passed ? 'PASS' : 'FAIL'} (scenarioId=${result.scenarioId}, run1=${result.run1.status}, run2=${result.run2.status})`
				);
				for (const inv of result.invariants.filter((i) => !i.passed)) {
					lines.push(`  - FAIL ${inv.invariantId}: ${inv.message ?? ''}`.trimEnd());
				}
			}
			lines.push('');
			lines.push('## Witness IDs (DRV-b1l.12)');
			for (const [key, value] of Object.entries(report.witnesses)) {
				lines.push(`- ${key}: ${JSON.stringify(value)}`);
			}
			lines.push('');
			lines.push('## Artifacts');
			lines.push(`- JSON: ${path.relative(process.cwd(), reportJsonPath)}`);
			lines.push(`- MD: ${path.relative(process.cwd(), reportMdPath)}`);
			lines.push(`- DB push log: ${path.relative(process.cwd(), dbPushLogPath)}`);
			lines.push(`- Seed log: ${path.relative(process.cwd(), seedLogPath)}`);
			lines.push('');
			lines.push('Repro (must set DATABASE_URL + CRON_SECRET):');
			lines.push('');
			lines.push('```bash');
			lines.push('pnpm nightly:cron-e2e');
			lines.push('```');

			await fs.writeFile(reportMdPath, `${lines.join('\n')}\n`, 'utf8');
		}

		if (!report.overall.passed) {
			throw new Error(
				`Cron E2E drill failed. See ${path.relative(process.cwd(), reportMdPath)} and ${path.relative(
					process.cwd(),
					reportJsonPath
				)}`
			);
		}
	});
});
