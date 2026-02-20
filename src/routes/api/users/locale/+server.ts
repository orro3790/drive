/**
 * User Locale API
 *
 * PATCH /api/users/locale - Persist user's preferred locale for notifications
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { locales } from '$lib/paraglide/runtime.js';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const { user: authedUser } = requireAuthenticatedWithOrg(locals);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!body || typeof body !== 'object' || !('locale' in body)) {
		throw error(400, 'Missing locale field');
	}

	const { locale } = body as { locale: string };

	if (!locales.includes(locale as (typeof locales)[number])) {
		throw error(400, 'Invalid locale');
	}

	await db
		.update(user)
		.set({ preferredLocale: locale, updatedAt: new Date() })
		.where(eq(user.id, authedUser.id));

	return json({ success: true });
};
