import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createManagerSseStream } from '$lib/server/realtime/managerSse';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { organizationId } = requireManagerWithOrg(locals);
	const stream = createManagerSseStream(organizationId);

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
