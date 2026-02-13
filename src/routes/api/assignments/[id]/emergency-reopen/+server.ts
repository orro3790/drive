/**
 * Legacy emergency reopen compatibility endpoint.
 *
 * New manager flows should use POST /api/assignments/[id]/override
 * with action=open_urgent_bidding.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assignmentIdParamsSchema } from '$lib/schemas/assignment';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals, params, fetch }) => {
	requireManagerWithOrg(locals);

	const paramsResult = assignmentIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid assignment ID');
	}

	const response = await fetch(`/api/assignments/${paramsResult.data.id}/override`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'open_urgent_bidding' })
	});

	const payload = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw error(
			response.status,
			(payload as { message?: string }).message ?? 'Emergency reopen failed'
		);
	}

	const bidWindow = (payload as { bidWindow?: { id?: string } | null }).bidWindow;
	const notifiedCount =
		typeof (payload as { notifiedCount?: unknown }).notifiedCount === 'number'
			? ((payload as { notifiedCount: number }).notifiedCount ?? 0)
			: 0;

	return json({
		success: true,
		bidWindowId: bidWindow?.id ?? null,
		notifiedCount
	});
};
