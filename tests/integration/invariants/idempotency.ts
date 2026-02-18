import { pool } from '../harness/db';

export async function assertNoDuplicateOpenBidWindows(params?: {
	assignmentIds?: readonly string[];
	trigger?: string;
}): Promise<void> {
	const assignmentIds = params?.assignmentIds ?? [];
	const trigger = params?.trigger;

	const clauses: string[] = ["status = 'open'"];
	const values: string[] = [];

	if (trigger) {
		values.push(trigger);
		clauses.push(`trigger = $${values.length}`);
	}

	if (assignmentIds.length > 0) {
		const placeholders = assignmentIds.map((id) => {
			values.push(id);
			return `$${values.length}`;
		});
		clauses.push(`assignment_id IN (${placeholders.join(', ')})`);
	}

	const result = await pool.query<{ assignment_id: string; open_count: string }>(
		`SELECT assignment_id, count(*)::text AS open_count
		 FROM bid_windows
		 WHERE ${clauses.join(' AND ')}
		 GROUP BY assignment_id
		 HAVING count(*) > 1
		 LIMIT 10;`,
		values
	);

	if ((result.rowCount ?? 0) > 0) {
		throw new Error(
			`IDEMP-001: duplicate open bid windows detected for assignment(s). Offenders: ${JSON.stringify(
				result.rows
			)}`
		);
	}
}

export async function assertNoDuplicateNoShowManagerAlerts(params: {
	organizationId: string;
	date: string;
	routeId: string;
}): Promise<void> {
	const result = await pool.query<{ count: string }>(
		`SELECT count(*)::text AS count
		 FROM notifications
		 WHERE type = 'driver_no_show'
			AND organization_id = $1
			AND data ->> 'date' = $2
			AND data ->> 'routeId' = $3;`,
		[params.organizationId, params.date, params.routeId]
	);

	const count = Number.parseInt(result.rows[0]?.count ?? '0', 10);
	if (count > 1) {
		throw new Error(
			`IDEMP-002: duplicate manager no-show alerts detected for route/date. organizationId=${params.organizationId} routeId=${params.routeId} date=${params.date} count=${count}`
		);
	}
}

export async function assertAtMostOneWinningBidForWindow(params: {
	bidWindowId: string;
}): Promise<void> {
	const result = await pool.query<{ count: string }>(
		`SELECT count(*)::text AS count
		 FROM bids
		 WHERE bid_window_id = $1
			AND status = 'won';`,
		[params.bidWindowId]
	);

	const count = Number.parseInt(result.rows[0]?.count ?? '0', 10);
	if (count > 1) {
		throw new Error(
			`IDEMP-003: multiple winning bids detected for a single bid window. bidWindowId=${params.bidWindowId} count=${count}`
		);
	}
}
