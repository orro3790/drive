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
const managerClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function formatSse(event: ManagerEventName, payload: unknown) {
	const data = JSON.stringify(payload);
	return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function broadcastManagerEvent(event: ManagerEventName, payload: unknown) {
	const message = formatSse(event, payload);
	for (const controller of managerClients) {
		try {
			controller.enqueue(message);
		} catch {
			managerClients.delete(controller);
		}
	}
}

export function broadcastAssignmentUpdated(payload: AssignmentUpdatedPayload) {
	broadcastManagerEvent('assignment:updated', payload);
}

export function broadcastBidWindowOpened(payload: BidWindowOpenedPayload) {
	broadcastManagerEvent('bid_window:opened', payload);
}

export function broadcastBidWindowClosed(payload: BidWindowClosedPayload) {
	broadcastManagerEvent('bid_window:closed', payload);
}

export function broadcastDriverFlagged(payload: DriverFlaggedPayload) {
	broadcastManagerEvent('driver:flagged', payload);
}

export function createManagerSseStream() {
	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	return new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;
			managerClients.add(controller);
			controller.enqueue(encoder.encode(':connected\n\n'));
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(':keepalive\n\n'));
				} catch {
					managerClients.delete(controller);
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
				managerClients.delete(controllerRef);
			}
		}
	});
}
