import { pool } from '../harness/db';

export async function assertAssignmentAssigned(params: {
	assignmentId: string;
	expectedDriverId: string;
}): Promise<void> {
	const { assignmentId, expectedDriverId } = params;
	const result = await pool.query<{
		status: string;
		user_id: string | null;
		assigned_by: string | null;
	}>(
		`SELECT status, user_id, assigned_by
		 FROM assignments
		 WHERE id = $1
		 LIMIT 1;`,
		[assignmentId]
	);

	const row = result.rows[0];
	if (!row) {
		throw new Error(`ASSIGN-001: assignment not found (${assignmentId})`);
	}

	if (row.user_id !== expectedDriverId || row.status !== 'scheduled') {
		throw new Error(
			`ASSIGN-001: assignment integrity failed. Expected scheduled + user_id=${expectedDriverId}. Observed: ${JSON.stringify(
				row
			)}`
		);
	}
}

export async function assertBidWindowResolved(params: {
	bidWindowId: string;
	expectedWinnerId: string;
}): Promise<void> {
	const { bidWindowId, expectedWinnerId } = params;
	const result = await pool.query<{ status: string; winner_id: string | null }>(
		`SELECT status, winner_id
		 FROM bid_windows
		 WHERE id = $1
		 LIMIT 1;`,
		[bidWindowId]
	);

	const row = result.rows[0];
	if (!row) {
		throw new Error(`ASSIGN-002: bid window not found (${bidWindowId})`);
	}

	if (row.status !== 'resolved' || row.winner_id !== expectedWinnerId) {
		throw new Error(
			`ASSIGN-002: bid window not resolved to expected winner. Expected resolved + winner_id=${expectedWinnerId}. Observed: ${JSON.stringify(
				row
			)}`
		);
	}
}
