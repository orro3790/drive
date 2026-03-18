export type DemoTodayState =
	| 'confirmed_arrivable'
	| 'arrived_startable'
	| 'started_completable'
	| 'completed_editable'
	| 'completed_locked';

export interface DemoNotificationBudget {
	maxTotal: number;
	maxUnread: number;
}

export interface DemoWarehouseFixture {
	key: string;
	name: string;
	address: string;
	managerKeys: string[];
}

export interface DemoRouteFixture {
	key: string;
	name: string;
	warehouseKey: string;
	startTime: string;
	managerKey: string;
}

export interface DemoManagerFixture {
	key: string;
	name: string;
	email: string;
	weeklyCap: number;
	ownedRouteKeys: string[];
}

export interface DemoDriverFixture {
	key: string;
	name: string;
	email: string;
	weeklyCap: number;
	isFlagged: boolean;
	flagWarningDaysAgo?: number;
	preferredDays: number[];
	preferredRouteKeys: string[];
	weeklyCompletedPlan: number[];
	qualifyingWeekIndexes: number[];
	arrivedOnTimeCount: number;
	highDeliveryCount: number;
	earlyCancellations: number;
	lateCancellations: number;
	noShows: number;
	bidWins: number;
	futureConfirmed: number;
	futureUnconfirmed: number;
	todayState?: DemoTodayState;
	notificationBudget: DemoNotificationBudget;
	storyGroup: 'green' | 'watch' | 'red';
	expectedStars: number;
	scoreRange: readonly [number, number];
	assignmentPoolEligible: boolean;
	requiresManagerIntervention: boolean;
}

export interface DemoExtraAssignmentFixture {
	key: string;
	routeKey: string;
	daysFromToday: number;
	status: 'unfilled';
}

export interface DemoBidWindowFixture {
	key: string;
	mode: 'competitive' | 'instant' | 'emergency';
	status: 'open' | 'resolved' | 'closed';
	assignmentRef:
		| { kind: 'driverBidWin'; driverKey: string }
		| { kind: 'driverNoShow'; driverKey: string }
		| { kind: 'extraAssignment'; assignmentKey: string };
	recipientDriverKeys: string[];
	pendingBidDriverKeys?: string[];
	winnerDriverKey?: string;
	payBonusPercent?: number;
	trigger?: string;
}

export interface DemoOrgFixture {
	slug: string;
	name: string;
	driverEmailDomain: string;
	managerEmailDomain: string;
	ownerManagerKey: string;
	warehouses: DemoWarehouseFixture[];
	routes: DemoRouteFixture[];
	managers: DemoManagerFixture[];
	drivers: DemoDriverFixture[];
	extraAssignments: DemoExtraAssignmentFixture[];
	bidWindows: DemoBidWindowFixture[];
	curated: true;
}

export const DEMO_PAST_WEEKS = 12;
export const DEMO_FUTURE_WEEKS = 2;

export const demoOrgAFixture: DemoOrgFixture = {
	slug: 'seed-org-a',
	name: 'Toronto Metro Logistics',
	driverEmailDomain: 'driver.test',
	managerEmailDomain: 'drivermanager.test',
	ownerManagerKey: 'manager001',
	warehouses: [
		{
			key: 'toronto-west',
			name: 'Mississauga West',
			address: '5500 Dixie Road, Mississauga, ON L4W 4N3',
			managerKeys: ['manager001', 'manager002']
		},
		{
			key: 'toronto-east',
			name: 'Scarborough East',
			address: '1500 Birchmount Road, Scarborough, ON M1P 2G5',
			managerKeys: ['manager001', 'manager002']
		}
	],
	routes: [
		{
			key: 'route-001',
			name: 'MW-101',
			warehouseKey: 'toronto-west',
			startTime: '07:00',
			managerKey: 'manager001'
		},
		{
			key: 'route-002',
			name: 'MW-102',
			warehouseKey: 'toronto-west',
			startTime: '08:00',
			managerKey: 'manager001'
		},
		{
			key: 'route-003',
			name: 'MW-103',
			warehouseKey: 'toronto-west',
			startTime: '09:00',
			managerKey: 'manager001'
		},
		{
			key: 'route-004',
			name: 'MW-104',
			warehouseKey: 'toronto-west',
			startTime: '10:00',
			managerKey: 'manager001'
		},
		{
			key: 'route-005',
			name: 'SE-201',
			warehouseKey: 'toronto-east',
			startTime: '07:00',
			managerKey: 'manager002'
		},
		{
			key: 'route-006',
			name: 'SE-202',
			warehouseKey: 'toronto-east',
			startTime: '08:00',
			managerKey: 'manager002'
		},
		{
			key: 'route-007',
			name: 'SE-203',
			warehouseKey: 'toronto-east',
			startTime: '09:00',
			managerKey: 'manager002'
		},
		{
			key: 'route-008',
			name: 'SE-204',
			warehouseKey: 'toronto-east',
			startTime: '10:00',
			managerKey: 'manager002'
		}
	],
	managers: [
		{
			key: 'manager001',
			name: 'Manager 001',
			email: 'manager001@drivermanager.test',
			weeklyCap: 5,
			ownedRouteKeys: ['route-001', 'route-002', 'route-003', 'route-004']
		},
		{
			key: 'manager002',
			name: 'Manager 002',
			email: 'manager002@drivermanager.test',
			weeklyCap: 5,
			ownedRouteKeys: ['route-005', 'route-006', 'route-007', 'route-008']
		}
	],
	drivers: [
		{
			key: 'driver001',
			name: 'Driver 001',
			email: 'driver001@driver.test',
			weeklyCap: 6,
			isFlagged: false,
			preferredDays: [1, 2, 3, 4, 5],
			preferredRouteKeys: ['route-001', 'route-002'],
			weeklyCompletedPlan: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4],
			qualifyingWeekIndexes: [0, 1, 2, 3],
			arrivedOnTimeCount: 8,
			highDeliveryCount: 20,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 1,
			futureConfirmed: 2,
			futureUnconfirmed: 0,
			todayState: 'confirmed_arrivable',
			notificationBudget: { maxTotal: 5, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 4,
			scoreRange: [180, 220],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver002',
			name: 'Driver 002',
			email: 'driver002@driver.test',
			weeklyCap: 6,
			isFlagged: false,
			preferredDays: [1, 2, 3, 4, 5],
			preferredRouteKeys: ['route-002', 'route-003'],
			weeklyCompletedPlan: [4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2],
			qualifyingWeekIndexes: [0, 1, 2, 3],
			arrivedOnTimeCount: 27,
			highDeliveryCount: 16,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 0,
			todayState: 'arrived_startable',
			notificationBudget: { maxTotal: 5, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 4,
			scoreRange: [170, 210],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver003',
			name: 'Driver 003',
			email: 'driver003@driver.test',
			weeklyCap: 5,
			isFlagged: false,
			preferredDays: [1, 2, 3, 4, 5],
			preferredRouteKeys: ['route-003', 'route-005'],
			weeklyCompletedPlan: [5, 4, 4, 4, 4, 3, 3, 3, 2, 2, 1, 1],
			qualifyingWeekIndexes: [0, 1, 2],
			arrivedOnTimeCount: 23,
			highDeliveryCount: 13,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 1,
			futureUnconfirmed: 0,
			todayState: 'started_completable',
			notificationBudget: { maxTotal: 5, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 3,
			scoreRange: [160, 200],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver004',
			name: 'Driver 004',
			email: 'driver004@driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 2, 3, 4],
			preferredRouteKeys: ['route-004', 'route-005'],
			weeklyCompletedPlan: [3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1],
			qualifyingWeekIndexes: [0, 1],
			arrivedOnTimeCount: 20,
			highDeliveryCount: 7,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 0,
			todayState: 'completed_editable',
			notificationBudget: { maxTotal: 4, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 2,
			scoreRange: [120, 160],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver005',
			name: 'Driver 005',
			email: 'driver005@driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 2, 4, 5],
			preferredRouteKeys: ['route-005', 'route-006'],
			weeklyCompletedPlan: [3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 0],
			qualifyingWeekIndexes: [0, 1],
			arrivedOnTimeCount: 18,
			highDeliveryCount: 6,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 1,
			futureConfirmed: 0,
			futureUnconfirmed: 1,
			todayState: 'completed_locked',
			notificationBudget: { maxTotal: 4, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 2,
			scoreRange: [110, 150],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver006',
			name: 'Driver 006',
			email: 'driver006@driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 2, 3, 5],
			preferredRouteKeys: ['route-002', 'route-006'],
			weeklyCompletedPlan: [3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1],
			qualifyingWeekIndexes: [0],
			arrivedOnTimeCount: 12,
			highDeliveryCount: 6,
			earlyCancellations: 1,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 1,
			futureUnconfirmed: 1,
			notificationBudget: { maxTotal: 6, maxUnread: 3 },
			storyGroup: 'watch',
			expectedStars: 1,
			scoreRange: [85, 110],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver007',
			name: 'Driver 007',
			email: 'driver007@driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 3, 4, 5],
			preferredRouteKeys: ['route-003', 'route-007'],
			weeklyCompletedPlan: [3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
			qualifyingWeekIndexes: [0],
			arrivedOnTimeCount: 12,
			highDeliveryCount: 5,
			earlyCancellations: 1,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 1,
			futureUnconfirmed: 1,
			notificationBudget: { maxTotal: 6, maxUnread: 3 },
			storyGroup: 'watch',
			expectedStars: 1,
			scoreRange: [75, 100],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver008',
			name: 'Driver 008',
			email: 'driver008@driver.test',
			weeklyCap: 3,
			isFlagged: true,
			flagWarningDaysAgo: 3,
			preferredDays: [2, 3, 4, 5],
			preferredRouteKeys: ['route-004', 'route-008'],
			weeklyCompletedPlan: [2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
			qualifyingWeekIndexes: [],
			arrivedOnTimeCount: 11,
			highDeliveryCount: 5,
			earlyCancellations: 2,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 1,
			notificationBudget: { maxTotal: 6, maxUnread: 3 },
			storyGroup: 'watch',
			expectedStars: 0,
			scoreRange: [65, 90],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'driver009',
			name: 'Driver 009',
			email: 'driver009@driver.test',
			weeklyCap: 2,
			isFlagged: false,
			preferredDays: [1, 3, 5],
			preferredRouteKeys: ['route-001', 'route-006'],
			weeklyCompletedPlan: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0],
			qualifyingWeekIndexes: [],
			arrivedOnTimeCount: 6,
			highDeliveryCount: 4,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 1,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 0,
			notificationBudget: { maxTotal: 8, maxUnread: 4 },
			storyGroup: 'red',
			expectedStars: 0,
			scoreRange: [0, 49],
			assignmentPoolEligible: false,
			requiresManagerIntervention: true
		},
		{
			key: 'driver010',
			name: 'Driver 010',
			email: 'driver010@driver.test',
			weeklyCap: 2,
			isFlagged: false,
			preferredDays: [2, 4, 5],
			preferredRouteKeys: ['route-005', 'route-008'],
			weeklyCompletedPlan: [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			qualifyingWeekIndexes: [],
			arrivedOnTimeCount: 7,
			highDeliveryCount: 4,
			earlyCancellations: 0,
			lateCancellations: 2,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 0,
			notificationBudget: { maxTotal: 8, maxUnread: 4 },
			storyGroup: 'red',
			expectedStars: 0,
			scoreRange: [0, 49],
			assignmentPoolEligible: false,
			requiresManagerIntervention: true
		}
	],
	extraAssignments: [
		{ key: 'competitive-open', routeKey: 'route-002', daysFromToday: 3, status: 'unfilled' },
		{ key: 'instant-open', routeKey: 'route-007', daysFromToday: 1, status: 'unfilled' }
	],
	bidWindows: [
		{
			key: 'resolved-competitive',
			mode: 'competitive',
			status: 'resolved',
			assignmentRef: { kind: 'driverBidWin', driverKey: 'driver001' },
			recipientDriverKeys: ['driver001', 'driver003', 'driver006'],
			winnerDriverKey: 'driver001',
			trigger: 'coverage_gap'
		},
		{
			key: 'competitive-open',
			mode: 'competitive',
			status: 'open',
			assignmentRef: { kind: 'extraAssignment', assignmentKey: 'competitive-open' },
			recipientDriverKeys: ['driver003', 'driver006', 'driver007'],
			pendingBidDriverKeys: ['driver003', 'driver006'],
			trigger: 'manager_repost'
		},
		{
			key: 'instant-open',
			mode: 'instant',
			status: 'open',
			assignmentRef: { kind: 'extraAssignment', assignmentKey: 'instant-open' },
			recipientDriverKeys: ['driver002', 'driver005', 'driver007'],
			pendingBidDriverKeys: ['driver005'],
			trigger: 'late_drop'
		},
		{
			key: 'emergency-no-show',
			mode: 'emergency',
			status: 'resolved',
			assignmentRef: { kind: 'driverNoShow', driverKey: 'driver009' },
			recipientDriverKeys: ['driver002', 'driver006'],
			winnerDriverKey: 'driver002',
			payBonusPercent: 20,
			trigger: 'no_show'
		}
	],
	curated: true
};

export const demoOrgBFixture: DemoOrgFixture = {
	slug: 'seed-org-b',
	name: 'Hamilton Delivery Co',
	driverEmailDomain: 'hamilton-driver.test',
	managerEmailDomain: 'hamiltonmanager.test',
	ownerManagerKey: 'orgb_manager001',
	warehouses: [
		{
			key: 'hamilton-central',
			name: 'Brampton North',
			address: '8400 Dixie Road, Brampton, ON L6T 5R1',
			managerKeys: ['orgb_manager001']
		}
	],
	routes: [
		{
			key: 'orgb-route-001',
			name: 'BN-301',
			warehouseKey: 'hamilton-central',
			startTime: '07:00',
			managerKey: 'orgb_manager001'
		},
		{
			key: 'orgb-route-002',
			name: 'BN-302',
			warehouseKey: 'hamilton-central',
			startTime: '08:00',
			managerKey: 'orgb_manager001'
		},
		{
			key: 'orgb-route-003',
			name: 'BN-303',
			warehouseKey: 'hamilton-central',
			startTime: '09:00',
			managerKey: 'orgb_manager001'
		}
	],
	managers: [
		{
			key: 'orgb_manager001',
			name: 'OrgB Manager 001',
			email: 'orgb_manager001@hamiltonmanager.test',
			weeklyCap: 5,
			ownedRouteKeys: ['orgb-route-001', 'orgb-route-002', 'orgb-route-003']
		}
	],
	drivers: [
		{
			key: 'orgb_driver001',
			name: 'OrgB Driver 001',
			email: 'orgb_driver001@hamilton-driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 2, 3, 4],
			preferredRouteKeys: ['orgb-route-001', 'orgb-route-002'],
			weeklyCompletedPlan: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0],
			qualifyingWeekIndexes: [0, 1],
			arrivedOnTimeCount: 8,
			highDeliveryCount: 4,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 1,
			futureUnconfirmed: 0,
			notificationBudget: { maxTotal: 4, maxUnread: 2 },
			storyGroup: 'green',
			expectedStars: 2,
			scoreRange: [60, 110],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'orgb_driver002',
			name: 'OrgB Driver 002',
			email: 'orgb_driver002@hamilton-driver.test',
			weeklyCap: 4,
			isFlagged: false,
			preferredDays: [1, 3, 4, 5],
			preferredRouteKeys: ['orgb-route-002', 'orgb-route-003'],
			weeklyCompletedPlan: [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			qualifyingWeekIndexes: [0],
			arrivedOnTimeCount: 6,
			highDeliveryCount: 3,
			earlyCancellations: 1,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 1,
			notificationBudget: { maxTotal: 4, maxUnread: 2 },
			storyGroup: 'watch',
			expectedStars: 1,
			scoreRange: [45, 100],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		},
		{
			key: 'orgb_driver003',
			name: 'OrgB Driver 003',
			email: 'orgb_driver003@hamilton-driver.test',
			weeklyCap: 3,
			isFlagged: false,
			preferredDays: [2, 4, 5],
			preferredRouteKeys: ['orgb-route-001', 'orgb-route-003'],
			weeklyCompletedPlan: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			qualifyingWeekIndexes: [],
			arrivedOnTimeCount: 4,
			highDeliveryCount: 2,
			earlyCancellations: 0,
			lateCancellations: 0,
			noShows: 0,
			bidWins: 0,
			futureConfirmed: 0,
			futureUnconfirmed: 1,
			notificationBudget: { maxTotal: 3, maxUnread: 1 },
			storyGroup: 'watch',
			expectedStars: 0,
			scoreRange: [40, 80],
			assignmentPoolEligible: true,
			requiresManagerIntervention: false
		}
	],
	extraAssignments: [],
	bidWindows: [],
	curated: true
};

export const DEMO_ORG_FIXTURES = [demoOrgAFixture, demoOrgBFixture] as const;

export function getDemoOrgFixture(slug: string): DemoOrgFixture {
	const fixture = DEMO_ORG_FIXTURES.find((candidate) => candidate.slug === slug);
	if (!fixture) {
		throw new Error(`Missing demo seed fixture for org '${slug}'`);
	}
	return fixture;
}

export function getDemoDriverFixture(
	fixture: DemoOrgFixture,
	driverKey: string
): DemoDriverFixture {
	const driver = fixture.drivers.find((candidate) => candidate.key === driverKey);
	if (!driver) {
		throw new Error(`Missing demo driver fixture '${driverKey}' for ${fixture.slug}`);
	}
	return driver;
}

export function getDemoManagerFixture(
	fixture: DemoOrgFixture,
	managerKey: string
): DemoManagerFixture {
	const manager = fixture.managers.find((candidate) => candidate.key === managerKey);
	if (!manager) {
		throw new Error(`Missing demo manager fixture '${managerKey}' for ${fixture.slug}`);
	}
	return manager;
}
