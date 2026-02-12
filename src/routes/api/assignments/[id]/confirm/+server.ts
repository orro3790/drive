/**
 * Assignment Confirmation API
 *
 * POST /api/assignments/[id]/confirm - Confirm an upcoming shift (driver only)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { confirmShift } from '$lib/server/services/confirmations';
import { requireDriverWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals, params }) => {
	const { user } = requireDriverWithOrg(locals);

	const result = await confirmShift(params.id, user.id);

	if (!result.success) {
		const status =
			result.error === 'Forbidden' ? 403 : result.error === 'Assignment not found' ? 404 : 400;
		throw error(status, result.error!);
	}

	return json({
		success: true,
		confirmedAt: result.confirmedAt!.toISOString()
	});
};
