import { describe, expect, it, vi } from 'vitest';

import {
	finalizeOrganizationCreateSignup,
	finalizeOrganizationJoinSignup,
	reserveOrganizationJoinSignup
} from '$lib/server/services/organizationSignup';

type ReserveDbClient = NonNullable<Parameters<typeof reserveOrganizationJoinSignup>[1]>;
type FinalizeJoinDbClient = NonNullable<Parameters<typeof finalizeOrganizationJoinSignup>[1]>;
type FinalizeCreateDbClient = NonNullable<Parameters<typeof finalizeOrganizationCreateSignup>[1]>;

type SelectResult = Record<string, unknown>[];
type UpdateResult = Record<string, unknown>[] | Error;

function createReserveDbClientMock(selectResults: SelectResult[], updateResults: UpdateResult[]) {
	const queuedSelectResults = [...selectResults];
	const queuedUpdateResults = [...updateResults];

	const nextSelect = () => queuedSelectResults.shift() ?? [];
	const nextUpdate = () => queuedUpdateResults.shift() ?? [];

	const makeSelectChain = (result: SelectResult) => {
		const promise = Promise.resolve(result);
		const chain = {
			limit: vi.fn(async () => result),
			orderBy: vi.fn(() => chain),
			then: promise.then.bind(promise),
			catch: promise.catch.bind(promise),
			finally: promise.finally.bind(promise)
		};

		return chain;
	};

	const selectWhereMock = vi.fn(() => makeSelectChain(nextSelect()));
	const selectFromMock = vi.fn(() => ({
		where: selectWhereMock,
		orderBy: vi.fn(() => makeSelectChain(nextSelect())),
		limit: vi.fn(async () => nextSelect())
	}));
	const selectMock = vi.fn(() => ({ from: selectFromMock }));

	const updateReturningMock = vi.fn(async () => {
		const result = nextUpdate();
		if (result instanceof Error) {
			throw result;
		}

		return result;
	});
	const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
	const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	const updateMock = vi.fn(() => ({ set: updateSetMock }));

	return {
		dbClient: {
			select: selectMock,
			update: updateMock
		} as unknown as ReserveDbClient,
		mocks: {
			updateReturningMock
		}
	};
}

describe('organization signup service', () => {
	it('returns invalid_org_code when organization code does not resolve', async () => {
		const { dbClient, mocks } = createReserveDbClientMock([[]], []);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'driver@example.test',
				organizationCode: 'MISSING-CODE'
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: false,
			reason: 'invalid_org_code'
		});
		expect(mocks.updateReturningMock).not.toHaveBeenCalled();
	});

	it('releases stale reservations before reserving a pending org approval', async () => {
		const { dbClient, mocks } = createReserveDbClientMock(
			[[{ id: 'org-1' }], [{ id: 'stale-1' }], [{ id: 'pending-1', targetRole: 'driver' }]],
			[[{ id: 'stale-1' }], [{ id: 'pending-1', organizationId: 'org-1', targetRole: 'driver' }]]
		);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'driver@example.test',
				organizationCode: 'ORG-CODE-123',
				now: new Date('2026-02-12T00:00:00.000Z')
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: true,
			reservationId: 'pending-1',
			organizationId: 'org-1',
			targetRole: 'driver'
		});
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(2);
	});

	it('revokes stale reservation when pending uniqueness would be violated', async () => {
		const uniqueCollision = Object.assign(new Error('pending duplicate'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_pending_org_email_kind_role'
		});

		const { dbClient, mocks } = createReserveDbClientMock(
			[[{ id: 'org-1' }], [{ id: 'stale-1' }], [{ id: 'pending-2', targetRole: 'manager' }]],
			[
				uniqueCollision,
				[{ id: 'stale-1' }],
				[{ id: 'pending-2', organizationId: 'org-1', targetRole: 'manager' }]
			]
		);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'manager@example.test',
				organizationCode: 'ORG-CODE-789',
				now: new Date('2026-02-12T00:00:00.000Z')
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: true,
			reservationId: 'pending-2',
			organizationId: 'org-1',
			targetRole: 'manager'
		});
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(3);
	});

	it('returns null for invalid reservation ids before opening a transaction', async () => {
		const transaction = vi.fn();
		const dbClient = { transaction } as unknown as FinalizeJoinDbClient;

		const result = await finalizeOrganizationJoinSignup(
			{
				reservationId: 'not-a-uuid',
				userId: 'driver-1'
			},
			dbClient
		);

		expect(result).toBeNull();
		expect(transaction).not.toHaveBeenCalled();
	});

	it('throws when join reservation state changes before consume step', async () => {
		const queuedUpdateResults = [[{ id: 'driver-1' }], []] as Record<string, unknown>[][];

		const tx = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(async () => [
							{
								id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
								organizationId: 'org-1',
								targetRole: 'driver'
							}
						])
					}))
				}))
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => queuedUpdateResults.shift() ?? [])
					}))
				}))
			}))
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeJoinDbClient;

		await expect(
			finalizeOrganizationJoinSignup(
				{
					reservationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
					userId: 'driver-1'
				},
				dbClient
			)
		).rejects.toThrow('signup_onboarding_reservation_state_changed');
	});

	it('retries organization creation when unique collisions occur', async () => {
		const uniqueSlugError = Object.assign(new Error('slug already exists'), {
			code: '23505',
			constraint: 'uq_organizations_slug'
		});

		const transaction = vi.fn().mockRejectedValueOnce(uniqueSlugError).mockResolvedValueOnce({
			organizationId: 'org-2',
			organizationSlug: 'acme-logistics-a1',
			organizationJoinCode: 'A1B2C3D4E5F6'
		});
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		const result = await finalizeOrganizationCreateSignup(
			{
				userId: 'owner-1',
				organizationName: 'Acme Logistics'
			},
			dbClient
		);

		expect(result).toEqual({
			organizationId: 'org-2',
			organizationSlug: 'acme-logistics-a1',
			organizationJoinCode: 'A1B2C3D4E5F6'
		});
		expect(transaction).toHaveBeenCalledTimes(2);
	});

	it('throws conflict after exhausting organization creation retries', async () => {
		const uniqueJoinCodeError = Object.assign(new Error('join code collision'), {
			code: '23505',
			constraint: 'uq_organizations_join_code_hash'
		});

		const transaction = vi.fn(async () => {
			throw uniqueJoinCodeError;
		});
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		await expect(
			finalizeOrganizationCreateSignup(
				{
					userId: 'owner-2',
					organizationName: 'Acme Logistics'
				},
				dbClient
			)
		).rejects.toThrow('organization_create_conflict');
		expect(transaction).toHaveBeenCalledTimes(6);
	});

	it('throws when create finalization cannot assign organization to signed-up user', async () => {
		const tx = {
			insert: vi.fn(() => ({
				values: vi.fn(() => ({
					returning: vi.fn(async () => [{ id: 'org-3', slug: 'acme-logistics' }])
				}))
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => [])
					}))
				}))
			}))
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		await expect(
			finalizeOrganizationCreateSignup(
				{
					userId: 'owner-missing',
					organizationName: 'Acme Logistics'
				},
				dbClient
			)
		).rejects.toThrow('signup_user_not_found');
	});
});
