import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

import { hashPassword } from '../../../scripts/seed/utils/password';

const EXCLUDED_TABLE_PREFIXES = ['__drizzle', 'drizzle'];
const PASSWORD = 'test1234';

const IDS = {
	orgA: '11111111-1111-1111-1111-111111111111',
	orgB: '22222222-2222-2222-2222-222222222222',
	warehouseA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	warehouseB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	routeA: 'aaaaaaaa-1111-4111-8111-111111111111',
	routeB: 'bbbbbbbb-2222-4222-8222-222222222222',
	managerA: 'e2e-manager-a',
	managerB: 'e2e-manager-b',
	driverA1: 'e2e-driver-a1',
	driverA2: 'e2e-driver-a2',
	driverB1: 'e2e-driver-b1'
} as const;

type BaselineUsers = {
	managerA: { id: string; email: string };
	managerB: { id: string; email: string };
	driverA1: { id: string; email: string };
	driverA2: { id: string; email: string };
	driverB1: { id: string; email: string };
};

export type E2eBaseline = {
	org: { a: { id: string }; b: { id: string } };
	warehouse: { a: { id: string }; b: { id: string } };
	route: { a: { id: string }; b: { id: string } };
	user: BaselineUsers;
};

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

function shouldExcludeTable(tableName: string): boolean {
	return EXCLUDED_TABLE_PREFIXES.some((prefix) => tableName.startsWith(prefix));
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function makePool(): Pool {
	return new Pool({ connectionString: requiredEnv('DATABASE_URL') });
}

export async function withDb<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
	const pool = makePool();
	try {
		return await run(pool);
	} finally {
		await pool.end();
	}
}

export async function resetDatabase(pool: Pool): Promise<void> {
	const result = await pool.query<{ tablename: string }>(
		"SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
	);

	const tables = result.rows
		.map((row) => row.tablename)
		.filter((name) => name && !shouldExcludeTable(name))
		.sort();

	if (tables.length === 0) {
		return;
	}

	const tableList = tables
		.map((name) => `${quoteIdentifier('public')}.${quoteIdentifier(name)}`)
		.join(', ');
	await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}

async function insertAuthUser(
	pool: Pool,
	params: {
		id: string;
		name: string;
		email: string;
		role: 'manager' | 'driver';
		organizationId: string;
		passwordHash: string;
	}
): Promise<void> {
	const now = new Date();

	await pool.query(
		`INSERT INTO "user" (
			id,
			name,
			email,
			email_verified,
			role,
			weekly_cap,
			is_flagged,
			organization_id,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
		[
			params.id,
			params.name,
			params.email,
			true,
			params.role,
			4,
			false,
			params.organizationId,
			now,
			now
		]
	);

	await pool.query(
		`INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
		[randomUUID(), params.id, params.email, 'credential', params.passwordHash, now, now]
	);
}

export async function seedUiBaseline(pool: Pool): Promise<E2eBaseline> {
	await resetDatabase(pool);

	await pool.query(
		`INSERT INTO organizations (id, name, slug, join_code_hash, owner_user_id)
		 VALUES ($1, $2, $3, $4, NULL), ($5, $6, $7, $8, NULL);`,
		[
			IDS.orgA,
			'Org A (E2E)',
			'org-a-e2e',
			'join-code-hash-a',
			IDS.orgB,
			'Org B (E2E)',
			'org-b-e2e',
			'join-code-hash-b'
		]
	);

	const passwordHash = await hashPassword(PASSWORD, 'e2e-seed-password');

	const users: BaselineUsers = {
		managerA: { id: IDS.managerA, email: 'manager.a@e2e.test' },
		managerB: { id: IDS.managerB, email: 'manager.b@e2e.test' },
		driverA1: { id: IDS.driverA1, email: 'driver.a1@e2e.test' },
		driverA2: { id: IDS.driverA2, email: 'driver.a2@e2e.test' },
		driverB1: { id: IDS.driverB1, email: 'driver.b1@e2e.test' }
	};

	await insertAuthUser(pool, {
		id: users.managerA.id,
		name: 'Manager A',
		email: users.managerA.email,
		role: 'manager',
		organizationId: IDS.orgA,
		passwordHash
	});
	await insertAuthUser(pool, {
		id: users.managerB.id,
		name: 'Manager B',
		email: users.managerB.email,
		role: 'manager',
		organizationId: IDS.orgB,
		passwordHash
	});
	await insertAuthUser(pool, {
		id: users.driverA1.id,
		name: 'Driver A1',
		email: users.driverA1.email,
		role: 'driver',
		organizationId: IDS.orgA,
		passwordHash
	});
	await insertAuthUser(pool, {
		id: users.driverA2.id,
		name: 'Driver A2',
		email: users.driverA2.email,
		role: 'driver',
		organizationId: IDS.orgA,
		passwordHash
	});
	await insertAuthUser(pool, {
		id: users.driverB1.id,
		name: 'Driver B1',
		email: users.driverB1.email,
		role: 'driver',
		organizationId: IDS.orgB,
		passwordHash
	});

	await pool.query(
		`UPDATE organizations
		 SET owner_user_id = CASE
			WHEN id = $1 THEN $2
			WHEN id = $3 THEN $4
			ELSE owner_user_id
		 END,
		 updated_at = now();`,
		[IDS.orgA, users.managerA.id, IDS.orgB, users.managerB.id]
	);

	await pool.query(
		`INSERT INTO organization_dispatch_settings (organization_id, updated_by)
		 VALUES ($1, NULL), ($2, NULL);`,
		[IDS.orgA, IDS.orgB]
	);

	await pool.query(`INSERT INTO driver_metrics (user_id) VALUES ($1), ($2), ($3);`, [
		users.driverA1.id,
		users.driverA2.id,
		users.driverB1.id
	]);

	await pool.query(`INSERT INTO driver_health_state (user_id) VALUES ($1), ($2), ($3);`, [
		users.driverA1.id,
		users.driverA2.id,
		users.driverB1.id
	]);

	await pool.query(
		`INSERT INTO warehouses (id, name, address, organization_id, created_by)
		 VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10);`,
		[
			IDS.warehouseA,
			'Warehouse A',
			'100 E2E Way',
			IDS.orgA,
			users.managerA.id,
			IDS.warehouseB,
			'Warehouse B',
			'200 E2E Way',
			IDS.orgB,
			users.managerB.id
		]
	);

	await pool.query(
		`INSERT INTO warehouse_managers (warehouse_id, user_id)
		 VALUES ($1, $2), ($3, $4);`,
		[IDS.warehouseA, users.managerA.id, IDS.warehouseB, users.managerB.id]
	);

	await pool.query(
		`INSERT INTO routes (id, name, warehouse_id, manager_id, start_time, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12);`,
		[
			IDS.routeA,
			'Route A',
			IDS.warehouseA,
			users.managerA.id,
			'09:00',
			users.managerA.id,
			IDS.routeB,
			'Route B',
			IDS.warehouseB,
			users.managerB.id,
			'09:00',
			users.managerB.id
		]
	);

	return {
		org: { a: { id: IDS.orgA }, b: { id: IDS.orgB } },
		warehouse: { a: { id: IDS.warehouseA }, b: { id: IDS.warehouseB } },
		route: { a: { id: IDS.routeA }, b: { id: IDS.routeB } },
		user: users
	};
}

export async function login(page: Page, email: string): Promise<void> {
	await page.goto('/sign-in?redirect=%2F');
	await page.locator('input[name="email"]').fill(email);
	await page.locator('input[name="password"]').fill(PASSWORD);
	await page.getByRole('button', { name: /continue/i }).click();
	await expect(page).not.toHaveURL(/\/sign-in/);
}

export async function assertNoCrossTenantLeakage(pool: Pool): Promise<void> {
	const assignmentsLeak = await pool.query(
		`SELECT a.id
		 FROM assignments a
		 INNER JOIN warehouses w ON w.id = a.warehouse_id
		 INNER JOIN "user" u ON u.id = a.user_id
		 WHERE a.user_id IS NOT NULL
			AND w.organization_id <> u.organization_id
		 LIMIT 1;`
	);
	expect(assignmentsLeak.rowCount ?? 0).toBe(0);

	const notificationsLeak = await pool.query(
		`SELECT n.id
		 FROM notifications n
		 INNER JOIN "user" u ON u.id = n.user_id
		 WHERE n.organization_id IS NOT NULL
			AND n.organization_id <> u.organization_id
		 LIMIT 1;`
	);
	expect(notificationsLeak.rowCount ?? 0).toBe(0);
}
