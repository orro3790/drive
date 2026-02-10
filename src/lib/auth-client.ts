import { inferAdditionalFields, adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import type { auth } from '$lib/server/auth';

import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

const statement = {
	...defaultStatements
} as const;

const ac = createAccessControl(statement);

const admin = ac.newRole({
	...adminAc.statements
});

const manager = ac.newRole({
	user: ['list', 'set-password', 'ban'],
	session: ['list', 'revoke']
});

export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields<typeof auth>(),
		adminClient({
			ac,
			roles: {
				admin,
				manager
			}
		})
	]
});
