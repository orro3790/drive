import { describe, expect, it } from 'vitest';

import { createRequestEvent } from '../../harness/requestEvent';
import { useIntegrationHarness } from '../harness/setup';

import { GET } from '../../../src/routes/api/warehouses/[id]/+server';

describe('API-001 (smoke)', () => {
	const h = useIntegrationHarness();

	function createUser(
		role: 'manager' | 'driver',
		id: string,
		organizationId: string
	): App.Locals['user'] {
		return {
			id,
			role,
			name: `${role}-${id}`,
			email: `${id}@integration.test`,
			organizationId
		} as App.Locals['user'];
	}

	it('denies manager access to a warehouse in another organization', async () => {
		const event = createRequestEvent({
			method: 'GET',
			params: { id: h.baseline.warehouse.b.id },
			locals: {
				organizationId: h.baseline.org.a.id,
				user: createUser('manager', h.baseline.user.managerA.id, h.baseline.org.a.id)
			}
		}) as Parameters<typeof GET>[0];

		await expect(GET(event)).rejects.toMatchObject({ status: 403 });
	});

	it('allows manager access to an in-org warehouse', async () => {
		const event = createRequestEvent({
			method: 'GET',
			params: { id: h.baseline.warehouse.a.id },
			locals: {
				organizationId: h.baseline.org.a.id,
				user: createUser('manager', h.baseline.user.managerA.id, h.baseline.org.a.id)
			}
		}) as Parameters<typeof GET>[0];

		const response = await GET(event);
		expect(response.status).toBe(200);

		const payload = await response.json();
		expect(payload).toMatchObject({
			warehouse: {
				id: h.baseline.warehouse.a.id
			}
		});
	});
});
