import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';
import { Client as NodePgClient } from 'pg';

// Load .env for local runs (secrets remain outside git).
loadDotenv();

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

type CronE2EWitnesses = {
	seedOrgs?: { orgAId: string; orgBId: string };
	scheduleAssigned?: {
		orgId: string;
		assignmentId: string;
		driverId: string;
		date: string;
		routeId: string;
		weekStart: string;
	} | null;
	autoDropped?: {
		bidWindowId: string;
		assignmentId: string;
		originalDriverId: string;
		shiftAutoDroppedNotificationId: string | null;
		assignmentStatus: string | null;
		assignmentCancelType: string | null;
		assignmentUserId: string | null;
	} | null;
	bidResolution?: {
		bidWindowId: string;
		assignmentId: string;
		winnerId: string;
		loserIds: string[];
	} | null;
	noShowManager?: {
		date: string;
		managerId: string;
		notificationId: string;
	} | null;
};

type CronE2EReport = {
	run?: {
		artifactDate?: string;
		frozenNow?: string;
		database?: { hostname?: string; database?: string };
	};
	witnesses?: CronE2EWitnesses;
	overall?: { passed?: boolean };
};

type WitnessCheckOutcome = {
	checkId: string;
	passed: boolean;
	message: string;
	screenshot?: string;
	evidence?: JsonValue;
};

type WitnessFlowResult = {
	flowId: string;
	actor: { userId: string; role: 'driver' | 'manager'; email: string };
	checks: WitnessCheckOutcome[];
	passed: boolean;
};

type WitnessUiReport = {
	run: {
		artifactDate: string;
		startedAt: string;
		finishedAt: string;
		baseUrl: string;
		viewport: { width: number; height: number };
		database: { hostname: string; database: string };
	};
	flows: WitnessFlowResult[];
	overall: {
		passed: boolean;
		failedFlows: string[];
	};
};

const VIEWPORT = { width: 390, height: 844 };
const SEED_PASSWORD = 'test1234';
const MAX_SESSION_NAME = 43;

/** Build a session name that stays under agent-browser's ~43-char limit. */
function sessionName(artifactDate: string, flowId: string, userId: string): string {
	// Format: w-<MMDD>-<flow>-<uid_suffix>  e.g. "w-0214-sched-driver_0003"
	const datePart = artifactDate.replace(/^\d{4}-/, '').replace(/-/g, '');
	const uidSuffix = userId.length > 14 ? userId.slice(-14) : userId;
	const name = `w-${datePart}-${flowId}-${uidSuffix}`;
	if (name.length > MAX_SESSION_NAME) {
		return name.slice(0, MAX_SESSION_NAME);
	}
	return name;
}

function sanitizeForLogs(text: string): string {
	let value = text;
	// Redact obvious emails.
	value = value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted_email>');
	// Redact seed password (not a secret, but don't leak in logs by accident).
	value = value.replace(/test1234/g, '<redacted_password>');
	return value;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value || !value.trim()) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value.trim();
}

function assertNightlyWitnessUiEnabled(): void {
	if (process.env.NIGHTLY_WITNESS_UI !== '1') {
		throw new Error(
			'Refusing to run witness UI automation without NIGHTLY_WITNESS_UI=1 (use: pnpm nightly:witness-ui)'
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

	return { hostname, database };
}

function getArgValue(flag: string): string | null {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return null;
	return process.argv[idx + 1] ?? null;
}

function getUtcDateString(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Check if an assignment date falls within the schedule page's visible
 * 2-week window (current Monday through +14 days). The schedule API uses
 * real Date.now(), not the cron drill's frozen time.
 */
function isDateInScheduleWindow(assignmentDate: string): boolean {
	const now = new Date();
	const day = now.getDay();
	const monday = new Date(now);
	monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
	monday.setHours(0, 0, 0, 0);
	const windowEnd = new Date(monday);
	windowEnd.setDate(monday.getDate() + 14);
	const d = new Date(`${assignmentDate}T12:00:00Z`);
	return d >= monday && d < windowEnd;
}

async function canReachBaseUrl(candidateBaseUrl: string): Promise<boolean> {
	const base = candidateBaseUrl.replace(/\/$/, '');
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5_000);
	try {
		// Use redirect: 'manual' so we accept 302 (auth redirect) as proof of life.
		const res = await fetch(`${base}/`, { signal: controller.signal, redirect: 'manual' });
		return res.status > 0;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function resolveBaseUrlFromDefaults(): Promise<string> {
	const candidates = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'];
	for (const candidate of candidates) {
		if (await canReachBaseUrl(candidate)) return candidate;
	}
	throw new Error(
		`Unable to reach dev server at any default BASE_URL (${candidates.join(', ')}). Start it (pnpm dev) or set BASE_URL explicitly.`
	);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readJson<T>(filePath: string): Promise<T> {
	const raw = await fs.readFile(filePath, 'utf8');
	return JSON.parse(raw) as T;
}

function redactEmail(email: string): string {
	const at = email.indexOf('@');
	if (at <= 1) return '***';
	return `${email[0]}***${email.slice(at)}`;
}

/** Resolve the full path to the agent-browser native executable (avoids cmd.exe shell). */
function resolveAgentBrowserExe(): string {
	// The npm global prefix puts the native exe here.
	const npmPrefix = process.env.APPDATA
		? path.join(process.env.APPDATA, 'npm')
		: path.join(process.env.HOME ?? '', '.npm-global');
	const nativeExe = path.join(
		npmPrefix,
		'node_modules',
		'agent-browser',
		'bin',
		`agent-browser-${process.platform}-x64.exe`
	);
	return nativeExe;
}

async function runProcess(params: {
	command: string;
	args: string[];
	timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string }> {
	const { command, args, timeoutMs } = params;

	// On Windows, avoid shell: true to prevent cmd.exe from mangling quotes and
	// special characters in arguments (JS expressions, URLs with %xx, etc.).
	// Use the native exe path directly instead.
	const resolvedCommand =
		process.platform === 'win32' && command === 'agent-browser'
			? resolveAgentBrowserExe()
			: command;

	return await new Promise((resolve, reject) => {
		const child = spawn(resolvedCommand, args, {
			windowsHide: true
		});

		let stdout = '';
		let stderr = '';

		const timeout = timeoutMs
			? setTimeout(() => {
					child.kill();
					reject(new Error(`${command} timed out after ${timeoutMs}ms`));
				}, timeoutMs)
			: null;

		child.stdout?.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr?.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (timeout) clearTimeout(timeout);
			if (code === 0) resolve({ stdout, stderr });
			else {
				const combined = (stderr || stdout || '').trim();
				const safeDetails = combined ? `: ${sanitizeForLogs(combined)}` : '';
				reject(new Error(`${command} exited with code ${code ?? 'null'}${safeDetails}`));
			}
		});
	});
}

async function runAgentBrowser(
	session: string,
	args: string[],
	timeoutMs?: number
): Promise<string> {
	const fullArgs = ['--session', session, ...args];
	const { stdout } = await runProcess({
		command: 'agent-browser',
		args: fullArgs,
		timeoutMs
	});
	return stdout.trim();
}

async function cleanupWitnessSessions(): Promise<void> {
	// Close any stale witness sessions still registered in the daemon.
	try {
		const { stdout } = await runProcess({
			command: 'agent-browser',
			args: ['session', 'list'],
			timeoutMs: 10_000
		});
		const lines = stdout.split('\n');
		for (const line of lines) {
			const name = line.trim();
			if (name && (name.startsWith('witness-') || name.startsWith('w-'))) {
				await runProcess({
					command: 'agent-browser',
					args: ['--session', name, 'close'],
					timeoutMs: 15_000
				}).catch(() => {});
			}
		}
	} catch {
		// Daemon may not be running; ignore.
	}

	// Remove stale PID/port files for witness sessions from prior failed runs.
	const agentBrowserDir = path.join(
		process.env.USERPROFILE ?? process.env.HOME ?? '',
		'.agent-browser'
	);
	try {
		const entries = await fs.readdir(agentBrowserDir);
		for (const entry of entries) {
			if (
				(entry.startsWith('witness-') || entry.startsWith('w-')) &&
				(entry.endsWith('.pid') || entry.endsWith('.port'))
			) {
				await fs.unlink(path.join(agentBrowserDir, entry)).catch(() => {});
			}
		}
	} catch {
		// Directory might not exist; ignore.
	}
}

async function killAgentBrowserDaemon(): Promise<void> {
	// Close all witness sessions gracefully first.
	await cleanupWitnessSessions();

	// Read daemon PID files and kill the processes directly (no PowerShell needed).
	const agentBrowserDir = path.join(
		process.env.USERPROFILE ?? process.env.HOME ?? '',
		'.agent-browser'
	);
	try {
		const entries = await fs.readdir(agentBrowserDir);
		for (const entry of entries) {
			if (entry.endsWith('.pid')) {
				const pidPath = path.join(agentBrowserDir, entry);
				try {
					const pidStr = (await fs.readFile(pidPath, 'utf8')).trim();
					const pid = Number(pidStr);
					if (pid > 0) {
						process.kill(pid, 'SIGTERM');
					}
				} catch {
					// Process may already be dead; ignore.
				}
				await fs.unlink(pidPath).catch(() => {});
			}
			if (entry.endsWith('.port')) {
				await fs.unlink(path.join(agentBrowserDir, entry)).catch(() => {});
			}
		}
	} catch {
		// Directory might not exist; ignore.
	}
}

/** Check if a CSS selector matches any elements on the page. Uses `get count`. */
async function elementExists(session: string, selector: string): Promise<boolean> {
	const out = await runAgentBrowser(session, ['get', 'count', selector], 30_000);
	return Number(out) > 0;
}

/** Wait for a data-loaded attribute to become "true" on the root testid element. */
async function waitForLoaded(params: { session: string; rootTestId: string; timeoutMs?: number }) {
	const { session, rootTestId, timeoutMs } = params;
	const selector = `[data-testid="${rootTestId}"][data-loaded="true"]`;
	await runAgentBrowser(session, ['wait', selector], timeoutMs ?? 60_000);
}

async function scrollUntilFound(params: {
	session: string;
	selector: string;
	maxScrolls: number;
}): Promise<{ found: boolean; scrolls: number }> {
	for (let i = 0; i <= params.maxScrolls; i++) {
		const found = await elementExists(params.session, params.selector);
		if (found) return { found: true, scrolls: i };

		if (i < params.maxScrolls) {
			await runAgentBrowser(params.session, ['scroll', 'down', '900'], 15_000);
			await runAgentBrowser(params.session, ['wait', '500'], 15_000);
		}
	}
	return { found: false, scrolls: params.maxScrolls };
}

async function screenshot(session: string, screenshotPath: string): Promise<void> {
	await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
	await runAgentBrowser(session, ['screenshot', screenshotPath, '--full'], 60_000);
}

async function tryReadSignInError(session: string): Promise<string | null> {
	const selector = '.notice-banner.warning .notice-content';
	const exists = await elementExists(session, selector);
	if (!exists) return null;
	try {
		const text = await runAgentBrowser(session, ['find', 'first', selector, 'text'], 15_000);
		const trimmed = text.trim();
		return trimmed ? trimmed : 'Sign-in error banner present (no text)';
	} catch {
		return 'Sign-in error banner present (unable to read text)';
	}
}

async function login(params: {
	session: string;
	baseUrl: string;
	redirectPath: string;
	email: string;
	viewport?: { width: number; height: number };
	failureScreenshotPath?: string;
}): Promise<void> {
	const headed = process.env.AGENT_BROWSER_HEADED === '1';
	const signInUrl = `${params.baseUrl}/sign-in?redirect=${encodeURIComponent(params.redirectPath)}`;

	await runAgentBrowser(
		params.session,
		headed ? ['open', signInUrl, '--headed'] : ['open', signInUrl],
		60_000
	);

	// Set viewport after open (daemon must be running first).
	if (params.viewport) {
		await runAgentBrowser(
			params.session,
			['set', 'viewport', String(params.viewport.width), String(params.viewport.height)],
			30_000
		);
		// Reload to apply viewport to the page content.
		await runAgentBrowser(params.session, ['reload'], 30_000);
	}

	await runAgentBrowser(params.session, ['wait', 'input[name=email]'], 30_000);

	// Prefer typing into focused inputs so Svelte bindings receive real input events.
	await runAgentBrowser(params.session, ['find', 'first', 'input[name=email]', 'click'], 30_000);
	await runAgentBrowser(params.session, ['press', 'Control+a'], 15_000).catch(() => {});
	await runAgentBrowser(params.session, ['type', params.email], 30_000);

	await runAgentBrowser(params.session, ['find', 'first', 'input[name=password]', 'click'], 30_000);
	await runAgentBrowser(params.session, ['press', 'Control+a'], 15_000).catch(() => {});
	await runAgentBrowser(params.session, ['type', SEED_PASSWORD], 30_000);

	await runAgentBrowser(params.session, ['find', 'first', 'button[type=submit]', 'click'], 30_000);
	await runAgentBrowser(params.session, ['wait', '--load', 'networkidle'], 30_000).catch(() => {});

	// Wait for the redirect to complete after login.
	// NOTE: Do NOT use `wait --url **/` — on Windows this pattern hangs/times out
	// because `**/` doesn't match URLs that don't end with `/`.
	// Instead, poll `get url` until we leave /sign-in.
	const loginDeadline = Date.now() + 60_000;
	while (Date.now() < loginDeadline) {
		const currentUrl = await runAgentBrowser(params.session, ['get', 'url'], 15_000);
		if (!currentUrl.includes('/sign-in')) {
			return;
		}

		const errorBanner = await tryReadSignInError(params.session);
		if (errorBanner) {
			if (params.failureScreenshotPath) {
				await screenshot(params.session, params.failureScreenshotPath).catch(() => {});
			}
			throw new Error(`Login failed: ${errorBanner}`);
		}

		await runAgentBrowser(params.session, ['wait', '1000'], 5_000);
	}

	if (params.failureScreenshotPath) {
		await screenshot(params.session, params.failureScreenshotPath).catch(() => {});
	}
	throw new Error('Login failed: still on /sign-in after 60s');
}

async function dbLookupUser(params: {
	client: NodePgClient;
	userId: string;
}): Promise<{ id: string; email: string; role: 'driver' | 'manager' }> {
	const result = await params.client.query<{ id: string; email: string; role: string }>(
		`select id, email, role from "user" where id = $1 limit 1;`,
		[params.userId]
	);
	const row = result.rows[0];
	if (!row?.email || !row?.role) {
		throw new Error(`User not found in DB: ${params.userId}`);
	}
	const role = row.role === 'manager' ? 'manager' : 'driver';
	return { id: row.id, email: row.email, role };
}

async function dbLookupNotificationId(params: {
	client: NodePgClient;
	userId: string;
	type: string;
	filters?: { jsonKey: string; jsonValue: string }[];
}): Promise<string | null> {
	const where: string[] = ['user_id = $1', 'type = $2'];
	const values: Array<string> = [params.userId, params.type];

	for (const filter of params.filters ?? []) {
		values.push(filter.jsonValue);
		where.push(`data ->> '${filter.jsonKey.replace(/'/g, '')}' = $${values.length}`);
	}

	const query = `
		select id
		from notifications
		where ${where.join(' and ')}
		order by created_at desc
		limit 1;
	`;

	const result = await params.client.query<{ id: string }>(query, values);
	return result.rows[0]?.id ?? null;
}

function upsertMarkdownSection(params: { existing: string; section: string }): string {
	const start = '<!-- UI_WITNESS_START -->';
	const end = '<!-- UI_WITNESS_END -->';
	const block = `${start}\n${params.section.trim()}\n${end}`;

	const existing = params.existing;
	const startIdx = existing.indexOf(start);
	const endIdx = existing.indexOf(end);
	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		return `${existing.slice(0, startIdx)}${block}${existing.slice(endIdx + end.length)}`;
	}

	const suffix = existing.endsWith('\n') ? '' : '\n';
	return `${existing}${suffix}\n## UI Witness Verification (agent-browser)\n\n${block}\n`;
}

async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	await fs.writeFile(tmpPath, contents, 'utf8');
	await fs.rename(tmpPath, filePath);
}

async function run(): Promise<void> {
	assertNightlyWitnessUiEnabled();

	// Kill any surviving daemon/browser processes from prior failed runs.
	await killAgentBrowserDaemon();

	const artifactDate =
		getArgValue('--artifactDate') ??
		getArgValue('--date') ??
		process.env.CRON_E2E_ARTIFACT_DATE?.trim() ??
		getUtcDateString();

	const baseUrl = (process.env.BASE_URL?.trim() || (await resolveBaseUrlFromDefaults())).replace(
		/\/$/,
		''
	);
	const databaseUrl = requireEnv('DATABASE_URL');
	const dbFingerprint = assertSafeDatabaseUrl(databaseUrl);

	const outDir = path.resolve(process.cwd(), 'logs', 'nightly', artifactDate);
	const reportJsonPath = path.join(outDir, 'cron-e2e-report.json');
	const reportMdPath = path.join(outDir, 'cron-e2e-report.md');
	const screenshotsDir = path.join(outDir, 'screenshots');
	const witnessJsonPath = path.join(outDir, 'witness-ui-report.json');

	if (!(await fileExists(reportJsonPath))) {
		const now = new Date().toISOString();
		const skipped: WitnessUiReport = {
			run: {
				artifactDate,
				startedAt: now,
				finishedAt: now,
				baseUrl,
				viewport: VIEWPORT,
				database: dbFingerprint
			},
			flows: [],
			overall: { passed: false, failedFlows: ['MISSING_CRON_REPORT'] }
		};
		await writeFileAtomic(witnessJsonPath, `${JSON.stringify(skipped, null, 2)}\n`);
		throw new Error(`Missing required artifact: ${path.relative(process.cwd(), reportJsonPath)}`);
	}

	const cronReport = await readJson<CronE2EReport>(reportJsonPath);
	const witnesses = cronReport.witnesses ?? {};
	const allowFailedCronWitness = process.env.NIGHTLY_ALLOW_WITNESS_WITH_FAILED_CRON === '1';

	if (cronReport.overall?.passed !== true && !allowFailedCronWitness) {
		const now = new Date().toISOString();
		const blocked: WitnessUiReport = {
			run: {
				artifactDate,
				startedAt: now,
				finishedAt: now,
				baseUrl,
				viewport: VIEWPORT,
				database: dbFingerprint
			},
			flows: [],
			overall: {
				passed: false,
				failedFlows: ['UPSTREAM_CRON_FAILED']
			}
		};

		await writeFileAtomic(witnessJsonPath, `${JSON.stringify(blocked, null, 2)}\n`);
		throw new Error(
			'Refusing witness run because cron-e2e-report overall.passed is not true (set NIGHTLY_ALLOW_WITNESS_WITH_FAILED_CRON=1 to override)'
		);
	}

	if (cronReport.overall?.passed !== true) {
		console.warn(
			'⚠ Cron drill report indicates FAIL. Continuing witness run because NIGHTLY_ALLOW_WITNESS_WITH_FAILED_CRON=1.'
		);
	}

	// Core witnesses that must always be present (scheduling, auto-drop, bidding).
	// noShowManager is optional — it depends on timing alignment between seed
	// anchor date, frozen time, and route start times.
	const requiredWitnessKeys: Array<keyof CronE2EWitnesses> = [
		'scheduleAssigned',
		'autoDropped',
		'bidResolution'
	];
	const optionalWitnessKeys: Array<keyof CronE2EWitnesses> = ['noShowManager'];

	for (const key of requiredWitnessKeys) {
		const value = witnesses[key];
		if (!value) {
			throw new Error(
				`Missing required witness payload in cron report: witnesses.${String(
					key
				)}. Rerun pnpm nightly:cron-e2e until it emits witness IDs.`
			);
		}
	}
	for (const key of optionalWitnessKeys) {
		if (!witnesses[key]) {
			console.warn(`⚠ Optional witness ${String(key)} is null — flow will be skipped.`);
		}
	}

	const startedAt = new Date().toISOString();
	const flows: WitnessFlowResult[] = [];

	const dbClient = new NodePgClient({ connectionString: databaseUrl });
	await dbClient.connect();

	try {
		await fs.mkdir(screenshotsDir, { recursive: true });

		// -------------------------------
		// 1) scheduleAssigned witness
		// -------------------------------
		if (witnesses.scheduleAssigned) {
			const flowId = 'scheduleAssigned';
			const actorUserId = witnesses.scheduleAssigned.driverId;
			const actor = await dbLookupUser({ client: dbClient, userId: actorUserId });
			const session = sessionName(artifactDate, flowId, actorUserId);
			const loginShot = path.join(screenshotsDir, `${flowId}__${actorUserId}__login__FAIL.png`);
			await login({
				session,
				baseUrl,
				redirectPath: '/schedule',
				email: actor.email,
				viewport: VIEWPORT,
				failureScreenshotPath: loginShot
			});

			const checks: WitnessCheckOutcome[] = [];

			await runAgentBrowser(session, ['open', `${baseUrl}/schedule`], 60_000);
			await waitForLoaded({ session, rootTestId: 'schedule-list', timeoutMs: 60_000 });
			const assignmentId = witnesses.scheduleAssigned.assignmentId;
			const assignmentSelector = `[data-testid="assignment-row"][data-assignment-id="${assignmentId}"]`;
			const assignmentFound = await elementExists(session, assignmentSelector);
			const scheduleShot = path.join(
				screenshotsDir,
				`${flowId}__${actorUserId}__schedule__${assignmentFound ? 'PASS' : 'FAIL'}.png`
			);
			await screenshot(session, scheduleShot);
			checks.push({
				checkId: 'schedule_has_assignment',
				passed: assignmentFound,
				message: assignmentFound
					? 'Schedule contains expected assignment row'
					: 'Schedule missing expected assignment row',
				screenshot: path.relative(process.cwd(), scheduleShot),
				evidence: { assignmentId }
			});

			const assignmentConfirmedNotificationId = await dbLookupNotificationId({
				client: dbClient,
				userId: actorUserId,
				type: 'assignment_confirmed',
				filters: [{ jsonKey: 'weekStart', jsonValue: witnesses.scheduleAssigned.weekStart }]
			});

			await runAgentBrowser(session, ['open', `${baseUrl}/notifications`], 60_000);
			await waitForLoaded({ session, rootTestId: 'notifications-list', timeoutMs: 60_000 });

			let notifFound = false;
			if (assignmentConfirmedNotificationId) {
				const notifSelector = `[data-testid="notification-row"][data-notification-id="${assignmentConfirmedNotificationId}"]`;
				notifFound = (await scrollUntilFound({ session, selector: notifSelector, maxScrolls: 8 }))
					.found;
			} else {
				// Fallback to type-only existence.
				notifFound = await elementExists(
					session,
					'[data-testid="notification-row"][data-notification-type="assignment_confirmed"]'
				);
			}

			const notifShot = path.join(
				screenshotsDir,
				`${flowId}__${actorUserId}__notifications__${notifFound ? 'PASS' : 'FAIL'}.png`
			);
			await screenshot(session, notifShot);
			checks.push({
				checkId: 'notifications_has_assignment_confirmed',
				passed: notifFound,
				message: notifFound
					? 'Notifications contains assignment_confirmed'
					: 'Notifications missing assignment_confirmed',
				screenshot: path.relative(process.cwd(), notifShot),
				evidence: {
					notificationId: assignmentConfirmedNotificationId,
					weekStart: witnesses.scheduleAssigned.weekStart
				}
			});

			const passed = checks.every((c) => c.passed);
			flows.push({
				flowId,
				actor: { userId: actorUserId, role: actor.role, email: redactEmail(actor.email) },
				checks,
				passed
			});

			await runAgentBrowser(session, ['close'], 30_000).catch(() => {});
		}

		// -------------------------------
		// 2) autoDropped witness
		// -------------------------------
		if (witnesses.autoDropped) {
			const flowId = 'autoDropped';
			const actorUserId = witnesses.autoDropped.originalDriverId;
			const actor = await dbLookupUser({ client: dbClient, userId: actorUserId });
			const session = sessionName(artifactDate, flowId, actorUserId);
			const loginShot = path.join(screenshotsDir, `${flowId}__${actorUserId}__login__FAIL.png`);

			await login({
				session,
				baseUrl,
				redirectPath: '/notifications',
				email: actor.email,
				viewport: VIEWPORT,
				failureScreenshotPath: loginShot
			});

			const checks: WitnessCheckOutcome[] = [];

			// Schedule should NOT contain the dropped assignment.
			await runAgentBrowser(session, ['open', `${baseUrl}/schedule`], 60_000);
			await waitForLoaded({ session, rootTestId: 'schedule-list', timeoutMs: 60_000 });
			const assignmentId = witnesses.autoDropped.assignmentId;
			const assignmentSelector = `[data-testid="assignment-row"][data-assignment-id="${assignmentId}"]`;
			const assignmentPresent = await elementExists(session, assignmentSelector);
			const scheduleShot = path.join(
				screenshotsDir,
				`${flowId}__${actorUserId}__schedule__${!assignmentPresent ? 'PASS' : 'FAIL'}.png`
			);
			await screenshot(session, scheduleShot);
			checks.push({
				checkId: 'schedule_missing_assignment',
				passed: !assignmentPresent,
				message: !assignmentPresent
					? 'Schedule does not contain dropped assignment row'
					: 'Schedule still contains dropped assignment row',
				screenshot: path.relative(process.cwd(), scheduleShot),
				evidence: { assignmentId }
			});

			await runAgentBrowser(session, ['open', `${baseUrl}/notifications`], 60_000);
			await waitForLoaded({ session, rootTestId: 'notifications-list', timeoutMs: 60_000 });
			const droppedNotifId = witnesses.autoDropped.shiftAutoDroppedNotificationId;
			let notifFound = false;
			if (droppedNotifId) {
				const selector = `[data-testid="notification-row"][data-notification-id="${droppedNotifId}"]`;
				notifFound = (await scrollUntilFound({ session, selector, maxScrolls: 8 })).found;
			} else {
				notifFound = await elementExists(
					session,
					'[data-testid="notification-row"][data-notification-type="shift_auto_dropped"]'
				);
			}

			const notifShot = path.join(
				screenshotsDir,
				`${flowId}__${actorUserId}__notifications__${notifFound ? 'PASS' : 'FAIL'}.png`
			);
			await screenshot(session, notifShot);
			checks.push({
				checkId: 'notifications_has_shift_auto_dropped',
				passed: notifFound,
				message: notifFound
					? 'Notifications contains shift_auto_dropped'
					: 'Notifications missing shift_auto_dropped',
				screenshot: path.relative(process.cwd(), notifShot),
				evidence: { notificationId: droppedNotifId }
			});

			const passed = checks.every((c) => c.passed);
			flows.push({
				flowId,
				actor: { userId: actorUserId, role: actor.role, email: redactEmail(actor.email) },
				checks,
				passed
			});

			await runAgentBrowser(session, ['close'], 30_000).catch(() => {});
		}

		// -------------------------------
		// 3) bidResolution witness (winner + one loser)
		// -------------------------------
		if (witnesses.bidResolution) {
			{
				const flowId = 'bidWinner';
				const actorUserId = witnesses.bidResolution.winnerId;
				const actor = await dbLookupUser({ client: dbClient, userId: actorUserId });
				const session = sessionName(artifactDate, flowId, actorUserId);
				const loginShot = path.join(screenshotsDir, `${flowId}__${actorUserId}__login__FAIL.png`);

				await login({
					session,
					baseUrl,
					redirectPath: '/schedule',
					email: actor.email,
					viewport: VIEWPORT,
					failureScreenshotPath: loginShot
				});

				const checks: WitnessCheckOutcome[] = [];
				const assignmentId = witnesses.bidResolution.assignmentId;

				// Look up the assignment date to check if it falls within the
				// schedule page's visible 2-week window (real Date.now(), not frozen).
				const assignmentDateResult = await dbClient.query<{ date: string }>(
					`select date::text from assignments where id = $1 limit 1;`,
					[assignmentId]
				);
				const assignmentDate = assignmentDateResult.rows[0]?.date ?? '';
				const inScheduleWindow = isDateInScheduleWindow(assignmentDate);

				if (inScheduleWindow) {
					await runAgentBrowser(session, ['open', `${baseUrl}/schedule`], 60_000);
					await waitForLoaded({ session, rootTestId: 'schedule-list', timeoutMs: 60_000 });
					const selector = `[data-testid="assignment-row"][data-assignment-id="${assignmentId}"]`;
					const assignmentFound = await elementExists(session, selector);
					const scheduleShot = path.join(
						screenshotsDir,
						`${flowId}__${actorUserId}__schedule__${assignmentFound ? 'PASS' : 'FAIL'}.png`
					);
					await screenshot(session, scheduleShot);
					checks.push({
						checkId: 'schedule_has_assignment',
						passed: assignmentFound,
						message: assignmentFound
							? 'Schedule contains bid-winner assignment row'
							: 'Schedule missing bid-winner assignment row',
						screenshot: path.relative(process.cwd(), scheduleShot),
						evidence: { assignmentId, assignmentDate }
					});
				} else {
					checks.push({
						checkId: 'schedule_has_assignment',
						passed: true,
						message: `Skipped: assignment date ${assignmentDate} is outside schedule 2-week window`,
						evidence: { assignmentId, assignmentDate, skipped: true }
					});
				}

				const bidWonNotificationId = await dbLookupNotificationId({
					client: dbClient,
					userId: actorUserId,
					type: 'bid_won',
					filters: [{ jsonKey: 'bidWindowId', jsonValue: witnesses.bidResolution.bidWindowId }]
				});

				await runAgentBrowser(session, ['open', `${baseUrl}/notifications`], 60_000);
				await waitForLoaded({ session, rootTestId: 'notifications-list', timeoutMs: 60_000 });
				let notifFound = false;
				if (bidWonNotificationId) {
					const notifSelector = `[data-testid="notification-row"][data-notification-id="${bidWonNotificationId}"]`;
					notifFound = (await scrollUntilFound({ session, selector: notifSelector, maxScrolls: 8 }))
						.found;
				} else {
					notifFound = await elementExists(
						session,
						'[data-testid="notification-row"][data-notification-type="bid_won"]'
					);
				}

				const notifShot = path.join(
					screenshotsDir,
					`${flowId}__${actorUserId}__notifications__${notifFound ? 'PASS' : 'FAIL'}.png`
				);
				await screenshot(session, notifShot);
				checks.push({
					checkId: 'notifications_has_bid_won',
					passed: notifFound,
					message: notifFound ? 'Notifications contains bid_won' : 'Notifications missing bid_won',
					screenshot: path.relative(process.cwd(), notifShot),
					evidence: { notificationId: bidWonNotificationId }
				});

				const passed = checks.every((c) => c.passed);
				flows.push({
					flowId,
					actor: { userId: actorUserId, role: actor.role, email: redactEmail(actor.email) },
					checks,
					passed
				});

				await runAgentBrowser(session, ['close'], 30_000).catch(() => {});
			}

			// pick the first loser deterministically
			const loserId = witnesses.bidResolution.loserIds[0];
			if (loserId) {
				const flowId = 'bidLoser';
				const actorUserId = loserId;
				const actor = await dbLookupUser({ client: dbClient, userId: actorUserId });
				const session = sessionName(artifactDate, flowId, actorUserId);
				const loginShot = path.join(screenshotsDir, `${flowId}__${actorUserId}__login__FAIL.png`);

				await login({
					session,
					baseUrl,
					redirectPath: '/notifications',
					email: actor.email,
					viewport: VIEWPORT,
					failureScreenshotPath: loginShot
				});

				const checks: WitnessCheckOutcome[] = [];
				const bidLostNotificationId = await dbLookupNotificationId({
					client: dbClient,
					userId: actorUserId,
					type: 'bid_lost',
					filters: [{ jsonKey: 'bidWindowId', jsonValue: witnesses.bidResolution.bidWindowId }]
				});

				await runAgentBrowser(session, ['open', `${baseUrl}/notifications`], 60_000);
				await waitForLoaded({ session, rootTestId: 'notifications-list', timeoutMs: 60_000 });

				let notifFound = false;
				if (bidLostNotificationId) {
					const selector = `[data-testid="notification-row"][data-notification-id="${bidLostNotificationId}"]`;
					notifFound = (await scrollUntilFound({ session, selector, maxScrolls: 8 })).found;
				} else {
					notifFound = await elementExists(
						session,
						'[data-testid="notification-row"][data-notification-type="bid_lost"]'
					);
				}

				const notifShot = path.join(
					screenshotsDir,
					`${flowId}__${actorUserId}__notifications__${notifFound ? 'PASS' : 'FAIL'}.png`
				);
				await screenshot(session, notifShot);
				checks.push({
					checkId: 'notifications_has_bid_lost',
					passed: notifFound,
					message: notifFound
						? 'Notifications contains bid_lost'
						: 'Notifications missing bid_lost',
					screenshot: path.relative(process.cwd(), notifShot),
					evidence: { notificationId: bidLostNotificationId }
				});

				const passed = checks.every((c) => c.passed);
				flows.push({
					flowId,
					actor: { userId: actorUserId, role: actor.role, email: redactEmail(actor.email) },
					checks,
					passed
				});

				await runAgentBrowser(session, ['close'], 30_000).catch(() => {});
			}
		}

		// -------------------------------
		// 4) noShowManager witness
		// -------------------------------
		if (witnesses.noShowManager) {
			const flowId = 'noShowManager';
			const actorUserId = witnesses.noShowManager.managerId;
			const actor = await dbLookupUser({ client: dbClient, userId: actorUserId });
			const session = sessionName(artifactDate, flowId, actorUserId);
			const loginShot = path.join(screenshotsDir, `${flowId}__${actorUserId}__login__FAIL.png`);

			await login({
				session,
				baseUrl,
				redirectPath: '/notifications',
				email: actor.email,
				viewport: VIEWPORT,
				failureScreenshotPath: loginShot
			});

			const checks: WitnessCheckOutcome[] = [];
			await runAgentBrowser(session, ['open', `${baseUrl}/notifications`], 60_000);
			await waitForLoaded({ session, rootTestId: 'notifications-list', timeoutMs: 60_000 });

			const notifId = witnesses.noShowManager.notificationId;
			const selector = `[data-testid="notification-row"][data-notification-id="${notifId}"]`;
			const notifFound = (await scrollUntilFound({ session, selector, maxScrolls: 10 })).found;
			const notifShot = path.join(
				screenshotsDir,
				`${flowId}__${actorUserId}__notifications__${notifFound ? 'PASS' : 'FAIL'}.png`
			);
			await screenshot(session, notifShot);
			checks.push({
				checkId: 'notifications_has_driver_no_show',
				passed: notifFound,
				message: notifFound
					? 'Notifications contains driver_no_show manager alert'
					: 'Notifications missing driver_no_show manager alert',
				screenshot: path.relative(process.cwd(), notifShot),
				evidence: { notificationId: notifId, date: witnesses.noShowManager.date }
			});

			const passed = checks.every((c) => c.passed);
			flows.push({
				flowId,
				actor: { userId: actorUserId, role: actor.role, email: redactEmail(actor.email) },
				checks,
				passed
			});

			await runAgentBrowser(session, ['close'], 30_000).catch(() => {});
		}
	} finally {
		await dbClient.end().catch(() => {});
		await killAgentBrowserDaemon();
	}

	const finishedAt = new Date().toISOString();
	const failedFlows = flows.filter((f) => !f.passed).map((f) => f.flowId);
	const witnessReport: WitnessUiReport = {
		run: {
			artifactDate,
			startedAt,
			finishedAt,
			baseUrl,
			viewport: VIEWPORT,
			database: dbFingerprint
		},
		flows,
		overall: {
			passed: failedFlows.length === 0,
			failedFlows
		}
	};

	await writeFileAtomic(witnessJsonPath, `${JSON.stringify(witnessReport, null, 2)}\n`);

	// Update nightly markdown report if it exists.
	if (await fileExists(reportMdPath)) {
		const md = await fs.readFile(reportMdPath, 'utf8');
		const lines: string[] = [];
		lines.push(`Run: ${startedAt} -> ${finishedAt}`);
		lines.push(`Base URL: ${baseUrl}`);
		lines.push(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`);
		lines.push('');
		for (const flow of flows) {
			lines.push(
				`- ${flow.flowId}: ${flow.passed ? 'PASS' : 'FAIL'} (${flow.actor.role}=${flow.actor.userId})`
			);
			for (const check of flow.checks) {
				lines.push(
					`  - ${check.checkId}: ${check.passed ? 'PASS' : 'FAIL'}${check.screenshot ? ` (${check.screenshot.replace(/\\/g, '/')})` : ''}`
				);
			}
		}

		const next = upsertMarkdownSection({ existing: md, section: lines.join('\n') });
		await writeFileAtomic(reportMdPath, next);
	}

	if (!witnessReport.overall.passed) {
		throw new Error(`Witness UI verification failed: ${failedFlows.join(', ')}`);
	}
}

run().catch((err) => {
	console.error(`[witness-ui] ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
});
