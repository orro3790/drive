import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user as authUser, warehouses } from './db/schema';

type AuthenticatedUser = NonNullable<App.Locals['user']>;

export type AuthenticatedOrgContext = {
	user: AuthenticatedUser;
	organizationId: string;
};

function resolveOrganizationId(locals: App.Locals, currentUser: AuthenticatedUser): string | null {
	if (locals.organizationId) {
		return locals.organizationId;
	}

	const userOrgId = currentUser.organizationId;
	if (typeof userOrgId === 'string' && userOrgId.length > 0) {
		return userOrgId;
	}

	return null;
}

export function requireAuthenticatedWithOrg(locals: App.Locals): AuthenticatedOrgContext {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = resolveOrganizationId(locals, locals.user);
	if (!organizationId) {
		throw error(403, 'Forbidden');
	}

	return {
		user: locals.user,
		organizationId
	};
}

export function requireManagerWithOrg(locals: App.Locals): AuthenticatedOrgContext {
	const authContext = requireAuthenticatedWithOrg(locals);
	if (authContext.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	return authContext;
}

export function requireDriverWithOrg(locals: App.Locals): AuthenticatedOrgContext {
	const authContext = requireAuthenticatedWithOrg(locals);
	if (authContext.user.role !== 'driver') {
		throw error(403, 'Forbidden');
	}

	return authContext;
}

export async function assertSameOrgUser(
	managerOrgId: string,
	targetUserId: string
): Promise<{ id: string }> {
	const [target] = await db
		.select({ id: authUser.id })
		.from(authUser)
		.where(and(eq(authUser.id, targetUserId), eq(authUser.organizationId, managerOrgId)))
		.limit(1);

	if (!target) {
		throw error(403, 'Forbidden');
	}

	return target;
}

export async function assertWarehouseInOrg(
	warehouseId: string,
	orgId: string
): Promise<{ id: string }> {
	const [warehouse] = await db
		.select({ id: warehouses.id })
		.from(warehouses)
		.where(and(eq(warehouses.id, warehouseId), eq(warehouses.organizationId, orgId)))
		.limit(1);

	if (!warehouse) {
		throw error(403, 'Forbidden');
	}

	return warehouse;
}
