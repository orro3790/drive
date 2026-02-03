/**
 * Better Auth Access Control Configuration
 *
 * Defines roles and permissions for the admin plugin.
 * See: https://www.better-auth.com/docs/plugins/admin#access-control
 */

import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

/**
 * Statement defines available resources and their actions.
 * We extend the default admin statements with any custom resources.
 */
const statement = {
	...defaultStatements
	// Add custom resources here if needed:
	// route: ['create', 'update', 'delete', 'assign'],
} as const;

export const ac = createAccessControl(statement);

/**
 * Admin role - full control over all admin operations
 */
export const admin = ac.newRole({
	...adminAc.statements
});

/**
 * Manager role - can reset passwords and manage users, but not full admin
 * In our domain: managers oversee warehouses and drivers
 */
export const manager = ac.newRole({
	user: ['list', 'set-password', 'ban'],
	session: ['list', 'revoke']
});

// Note: 'user' is the default role and doesn't need to be defined.
// Users with role 'user' (or 'driver' in our domain) have no admin permissions.
