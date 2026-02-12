import type { ShiftProgress } from '$lib/schemas/route';

type ManagerEventName =
	| 'assignment:updated'
	| 'bid_window:opened'
	| 'bid_window:closed'
	| 'driver:flagged';

type AssignmentUpdatedPayload = {
	assignmentId: string;
	status: string;
	driverId?: string | null;
	driverName?: string | null;
	routeId?: string | null;
	bidWindowClosesAt?: string | null;
	shiftProgress?: ShiftProgress | null;
};

type BidWindowOpenedPayload = {
	assignmentId: string;
	routeId: string;
	routeName: string;
	assignmentDate: string;
	closesAt: string;
};

type BidWindowClosedPayload = {
	assignmentId: string;
	bidWindowId: string;
	winnerId?: string | null;
	winnerName?: string | null;
};

type DriverFlaggedPayload = {
	driverId: string;
	attendanceRate?: number;
	threshold?: number;
	totalShifts?: number;
};

const encoder = new TextEncoder();
const managerClientsByOrganization = new Map<
	string,
	Set<ReadableStreamDefaultController<Uint8Array>>
>();

function getManagerClientBucket(organizationId: string) {
	let bucket = managerClientsByOrganization.get(organizationId);
	if (!bucket) {
		bucket = new Set<ReadableStreamDefaultController<Uint8Array>>();
		managerClientsByOrganization.set(organizationId, bucket);
	}

	return bucket;
}

function removeManagerClient(
	organizationId: string,
	controller: ReadableStreamDefaultController<Uint8Array>
) {
	const bucket = managerClientsByOrganization.get(organizationId);
	if (!bucket) {
		return;
	}

	bucket.delete(controller);
	if (bucket.size === 0) {
		managerClientsByOrganization.delete(organizationId);
	}
}

function normalizeOrganizationId(organizationId: string): string | null {
	const trimmed = organizationId.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function formatSse(event: ManagerEventName, payload: unknown) {
	const data = JSON.stringify(payload);
	return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function broadcastManagerEvent(
	organizationId: string,
	event: ManagerEventName,
	payload: unknown
) {
	const scopedOrganizationId = normalizeOrganizationId(organizationId);
	if (!scopedOrganizationId) {
		return;
	}

	const bucket = managerClientsByOrganization.get(scopedOrganizationId);
	if (!bucket || bucket.size === 0) {
		return;
	}

	const message = formatSse(event, payload);
	for (const controller of bucket) {
		try {
			controller.enqueue(message);
		} catch {
			removeManagerClient(scopedOrganizationId, controller);
		}
	}
}

export function broadcastAssignmentUpdated(
	organizationId: string,
	payload: AssignmentUpdatedPayload
) {
	broadcastManagerEvent(organizationId, 'assignment:updated', payload);
}

export function broadcastBidWindowOpened(organizationId: string, payload: BidWindowOpenedPayload) {
	broadcastManagerEvent(organizationId, 'bid_window:opened', payload);
}

export function broadcastBidWindowClosed(organizationId: string, payload: BidWindowClosedPayload) {
	broadcastManagerEvent(organizationId, 'bid_window:closed', payload);
}

export function broadcastDriverFlagged(organizationId: string, payload: DriverFlaggedPayload) {
	broadcastManagerEvent(organizationId, 'driver:flagged', payload);
}

export function createManagerSseStream(organizationId: string) {
	const scopedOrganizationId = normalizeOrganizationId(organizationId);
	if (!scopedOrganizationId) {
		throw new Error('Organization context is required for manager SSE stream');
	}

	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	return new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;
			const bucket = getManagerClientBucket(scopedOrganizationId);
			bucket.add(controller);
			controller.enqueue(encoder.encode(':connected\n\n'));
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(':keepalive\n\n'));
				} catch {
					removeManagerClient(scopedOrganizationId, controller);
					if (heartbeat) {
						clearInterval(heartbeat);
						heartbeat = null;
					}
				}
			}, 30000);
		},
		cancel() {
			if (heartbeat) {
				clearInterval(heartbeat);
				heartbeat = null;
			}
			if (controllerRef) {
				removeManagerClient(scopedOrganizationId, controllerRef);
			}
		}
	});
}
