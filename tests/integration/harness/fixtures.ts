import { pool } from './db';

export const BASELINE_IDS = {
	orgA: '11111111-1111-1111-1111-111111111111',
	orgB: '22222222-2222-2222-2222-222222222222',
	// Use RFC4122-valid UUIDs (zod's uuid() validates version/variant bits).
	warehouseA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	warehouseB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	routeA: 'aaaaaaaa-1111-4111-8111-111111111111',
	routeB: 'bbbbbbbb-2222-4222-8222-222222222222',
	managerA: 'manager-a',
	managerB: 'manager-b',
	driverA1: 'driver-a1',
	driverA2: 'driver-a2',
	driverB1: 'driver-b1'
} as const;

export type Baseline = {
	org: { a: { id: string }; b: { id: string } };
	warehouse: { a: { id: string }; b: { id: string } };
	route: { a: { id: string }; b: { id: string } };
	user: {
		managerA: { id: string; role: 'manager'; organizationId: string };
		managerB: { id: string; role: 'manager'; organizationId: string };
		driverA1: { id: string; role: 'driver'; organizationId: string };
		driverA2: { id: string; role: 'driver'; organizationId: string };
		driverB1: { id: string; role: 'driver'; organizationId: string };
	};
};

export async function assertBaselineClean(): Promise<void> {
	// Baseline should not create domain side effects like notifications/assignments.
	const notificationsResult = await pool.query('SELECT id FROM notifications LIMIT 1;');
	const assignmentsResult = await pool.query('SELECT id FROM assignments LIMIT 1;');

	if ((notificationsResult.rowCount ?? 0) > 0 || (assignmentsResult.rowCount ?? 0) > 0) {
		throw new Error('Baseline fixtures are expected to start from a clean DB');
	}
}

export async function seedBaseline(): Promise<Baseline> {
	await assertBaselineClean();

	await pool.query(
		`INSERT INTO organizations (id, name, slug, join_code_hash, owner_user_id)
		 VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10);`,
		[
			BASELINE_IDS.orgA,
			'Org A (Integration)',
			'org-a-integration',
			'join_code_hash_a',
			null,
			BASELINE_IDS.orgB,
			'Org B (Integration)',
			'org-b-integration',
			'join_code_hash_b',
			null
		]
	);

	await pool.query(
		`INSERT INTO organization_dispatch_settings (organization_id, updated_by)
		 VALUES ($1, $2), ($3, $4);`,
		[BASELINE_IDS.orgA, null, BASELINE_IDS.orgB, null]
	);

	await pool.query(
		`INSERT INTO "user" (id, name, email, role, organization_id)
		 VALUES
		 ($1, $2, $3, $4, $5),
		 ($6, $7, $8, $9, $10),
		 ($11, $12, $13, $14, $15),
		 ($16, $17, $18, $19, $20),
		 ($21, $22, $23, $24, $25);`,
		[
			BASELINE_IDS.managerA,
			'Manager A',
			'manager.a@integration.test',
			'manager',
			BASELINE_IDS.orgA,
			BASELINE_IDS.managerB,
			'Manager B',
			'manager.b@integration.test',
			'manager',
			BASELINE_IDS.orgB,
			BASELINE_IDS.driverA1,
			'Driver A1',
			'driver.a1@integration.test',
			'driver',
			BASELINE_IDS.orgA,
			BASELINE_IDS.driverA2,
			'Driver A2',
			'driver.a2@integration.test',
			'driver',
			BASELINE_IDS.orgA,
			BASELINE_IDS.driverB1,
			'Driver B1',
			'driver.b1@integration.test',
			'driver',
			BASELINE_IDS.orgB
		]
	);

	await pool.query(`INSERT INTO driver_metrics (user_id) VALUES ($1), ($2), ($3);`, [
		BASELINE_IDS.driverA1,
		BASELINE_IDS.driverA2,
		BASELINE_IDS.driverB1
	]);

	await pool.query(`INSERT INTO driver_health_state (user_id) VALUES ($1), ($2), ($3);`, [
		BASELINE_IDS.driverA1,
		BASELINE_IDS.driverA2,
		BASELINE_IDS.driverB1
	]);

	await pool.query(
		`INSERT INTO warehouses (id, name, address, organization_id, created_by)
		 VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10);`,
		[
			BASELINE_IDS.warehouseA,
			'Warehouse A',
			'1 Integration Way',
			BASELINE_IDS.orgA,
			BASELINE_IDS.managerA,
			BASELINE_IDS.warehouseB,
			'Warehouse B',
			'2 Integration Way',
			BASELINE_IDS.orgB,
			BASELINE_IDS.managerB
		]
	);

	await pool.query(
		`INSERT INTO warehouse_managers (warehouse_id, user_id) VALUES ($1, $2), ($3, $4);`,
		[BASELINE_IDS.warehouseA, BASELINE_IDS.managerA, BASELINE_IDS.warehouseB, BASELINE_IDS.managerB]
	);

	await pool.query(
		`INSERT INTO routes (id, name, warehouse_id, manager_id, start_time, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12);`,
		[
			BASELINE_IDS.routeA,
			'Route A',
			BASELINE_IDS.warehouseA,
			BASELINE_IDS.managerA,
			'09:00',
			BASELINE_IDS.managerA,
			BASELINE_IDS.routeB,
			'Route B',
			BASELINE_IDS.warehouseB,
			BASELINE_IDS.managerB,
			'09:00',
			BASELINE_IDS.managerB
		]
	);

	return {
		org: { a: { id: BASELINE_IDS.orgA }, b: { id: BASELINE_IDS.orgB } },
		warehouse: { a: { id: BASELINE_IDS.warehouseA }, b: { id: BASELINE_IDS.warehouseB } },
		route: { a: { id: BASELINE_IDS.routeA }, b: { id: BASELINE_IDS.routeB } },
		user: {
			managerA: { id: BASELINE_IDS.managerA, role: 'manager', organizationId: BASELINE_IDS.orgA },
			managerB: { id: BASELINE_IDS.managerB, role: 'manager', organizationId: BASELINE_IDS.orgB },
			driverA1: { id: BASELINE_IDS.driverA1, role: 'driver', organizationId: BASELINE_IDS.orgA },
			driverA2: { id: BASELINE_IDS.driverA2, role: 'driver', organizationId: BASELINE_IDS.orgA },
			driverB1: { id: BASELINE_IDS.driverB1, role: 'driver', organizationId: BASELINE_IDS.orgB }
		}
	};
}
