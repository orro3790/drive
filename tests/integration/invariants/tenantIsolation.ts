import { pool } from '../harness/db';

export async function assertNoCrossOrgNotificationLeakage(): Promise<void> {
	const result = await pool.query<{
		id: string;
		type: string;
		user_id: string;
		user_organization_id: string;
		notification_organization_id: string;
	}>(
		`SELECT n.id,
				n.type,
				n.user_id,
				u.organization_id AS user_organization_id,
				n.organization_id AS notification_organization_id
		 FROM notifications n
		 INNER JOIN "user" u ON u.id = n.user_id
		 WHERE n.organization_id IS NOT NULL
			AND n.organization_id <> u.organization_id;`
	);

	if ((result.rowCount ?? 0) > 0) {
		throw new Error(
			`NOTIF-001: cross-org notification leakage detected (notification.organization_id must match user.organization_id). Offenders: ${JSON.stringify(
				result.rows
			)}`
		);
	}
}

export async function assertNoCrossOrgAssignmentLeakage(): Promise<void> {
	const result = await pool.query<{
		assignment_id: string;
		user_id: string;
		user_organization_id: string;
		warehouse_organization_id: string;
	}>(
		`SELECT a.id AS assignment_id,
				a.user_id,
				u.organization_id AS user_organization_id,
				w.organization_id AS warehouse_organization_id
		 FROM assignments a
		 INNER JOIN warehouses w ON w.id = a.warehouse_id
		 INNER JOIN "user" u ON u.id = a.user_id
		 WHERE a.user_id IS NOT NULL
			AND u.organization_id <> w.organization_id;`
	);

	if ((result.rowCount ?? 0) > 0) {
		throw new Error(
			`TENANT-002: assignment assigned to cross-org user (assignment warehouse org must match user org). Offenders: ${JSON.stringify(
				result.rows
			)}`
		);
	}
}

export async function assertNoCrossOrgBidWinnerLeakage(): Promise<void> {
	const result = await pool.query<{
		bid_window_id: string;
		winner_id: string;
		winner_organization_id: string;
		warehouse_organization_id: string;
	}>(
		`SELECT bw.id AS bid_window_id,
				bw.winner_id,
				u.organization_id AS winner_organization_id,
				w.organization_id AS warehouse_organization_id
		 FROM bid_windows bw
		 INNER JOIN assignments a ON a.id = bw.assignment_id
		 INNER JOIN warehouses w ON w.id = a.warehouse_id
		 INNER JOIN "user" u ON u.id = bw.winner_id
		 WHERE bw.winner_id IS NOT NULL
			AND u.organization_id <> w.organization_id;`
	);

	if ((result.rowCount ?? 0) > 0) {
		throw new Error(
			`TENANT-003: bid window resolved to cross-org winner (warehouse org must match winner org). Offenders: ${JSON.stringify(
				result.rows
			)}`
		);
	}
}
