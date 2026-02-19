/**
 * Notifications Store
 *
 * Manages notification inbox state, pagination, and read actions.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';
import {
	notificationListResponseSchema,
	notificationMarkAllReadResponseSchema,
	notificationMarkReadResponseSchema,
	type Notification
} from '$lib/schemas/api/notifications';

type PaginationState = {
	pageIndex: number;
	pageSize: number;
	total: number;
	pageCount: number;
};

const emergencyNotificationTypes = new Set<Notification['type']>([
	'route_unfilled',
	'driver_no_show',
	'emergency_route_available'
]);

function isEmergencyNotification(notification: Pick<Notification, 'type'>): boolean {
	return emergencyNotificationTypes.has(notification.type);
}

const state = $state<{
	notifications: Notification[];
	unreadCount: number;
	emergencyUnreadCount: number;
	pagination: PaginationState;
	hasMore: boolean;
	hasLoaded: boolean;
	isLoading: boolean;
	isLoadingMore: boolean;
	isMarkingAll: boolean;
	error: string | null;
}>({
	notifications: [],
	unreadCount: 0,
	emergencyUnreadCount: 0,
	pagination: {
		pageIndex: 0,
		pageSize: 20,
		total: 0,
		pageCount: 1
	},
	hasMore: true,
	hasLoaded: false,
	isLoading: false,
	isLoadingMore: false,
	isMarkingAll: false,
	error: null
});

const mutationVersions = new Map<string, number>();

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
}

export const notificationsStore = {
	get notifications() {
		return state.notifications;
	},
	get unreadCount() {
		return state.unreadCount;
	},
	get emergencyUnreadCount() {
		return state.emergencyUnreadCount;
	},
	get pagination() {
		return state.pagination;
	},
	get hasMore() {
		return state.hasMore;
	},
	get hasLoaded() {
		return state.hasLoaded;
	},
	get isLoading() {
		return state.isLoading;
	},
	get isLoadingMore() {
		return state.isLoadingMore;
	},
	get isMarkingAll() {
		return state.isMarkingAll;
	},
	get error() {
		return state.error;
	},

	async loadPage(pageIndex = state.pagination.pageIndex) {
		if (state.isLoading) return;
		state.isLoading = true;
		state.error = null;

		const page = pageIndex + 1;
		const pageSize = state.pagination.pageSize;

		try {
			const res = await fetch(`/api/notifications?page=${page}&pageSize=${pageSize}`);
			if (!res.ok) {
				throw new Error('Failed to load notifications');
			}

			const data = await res.json();
			const parsed = notificationListResponseSchema.safeParse(data);
			if (!parsed.success) {
				throw new Error('Invalid notifications response');
			}

			const { notifications, unreadCount, emergencyUnreadCount, pagination } = parsed.data;
			const pageIndex = Math.min(
				Math.max(0, pagination.page - 1),
				Math.max(0, pagination.totalPages - 1)
			);
			state.notifications = notifications;
			state.unreadCount = unreadCount;
			state.emergencyUnreadCount = emergencyUnreadCount;
			state.pagination = {
				pageIndex,
				pageSize: pagination.pageSize,
				total: pagination.total,
				pageCount: pagination.totalPages
			};
			state.hasMore = pageIndex + 1 < pagination.totalPages;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.notifications_load_error());
		} finally {
			state.isLoading = false;
			state.hasLoaded = true;
		}
	},

	async markRead(notificationId: string) {
		const target = state.notifications.find((item) => item.id === notificationId);
		if (!target || target.read) return;
		if (!ensureOnlineForWrite()) return;

		const mutationKey = `markRead:${notificationId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const previousNotifications = state.notifications;
		const previousUnreadCount = state.unreadCount;
		const previousEmergencyUnreadCount = state.emergencyUnreadCount;
		const wasEmergency = isEmergencyNotification(target);

		state.notifications = previousNotifications.map((item) =>
			item.id === notificationId ? { ...item, read: true } : item
		);
		state.unreadCount = Math.max(0, previousUnreadCount - 1);
		state.emergencyUnreadCount = Math.max(0, previousEmergencyUnreadCount - (wasEmergency ? 1 : 0));

		try {
			const res = await fetch(`/api/notifications/${notificationId}/read`, {
				method: 'PATCH'
			});
			if (!res.ok) {
				throw new Error('Failed to mark notification as read');
			}

			const data = await res.json();
			const parsed = notificationMarkReadResponseSchema.safeParse(data);
			if (!parsed.success || !parsed.data.success) {
				throw new Error('Failed to mark notification as read');
			}
		} catch (err) {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.notifications = previousNotifications;
				state.unreadCount = previousUnreadCount;
				state.emergencyUnreadCount = previousEmergencyUnreadCount;
				toastStore.error(m.notifications_mark_read_error());
			}
		}
	},

	async markAllRead() {
		if (state.isMarkingAll || state.unreadCount === 0) return;
		if (!ensureOnlineForWrite()) return;

		const mutationKey = 'markAllRead';
		const mutationVersion = nextMutationVersion(mutationKey);
		state.isMarkingAll = true;

		const previousNotifications = state.notifications;
		const previousUnreadCount = state.unreadCount;
		const previousEmergencyUnreadCount = state.emergencyUnreadCount;
		state.notifications = previousNotifications.map((item) => ({ ...item, read: true }));
		state.unreadCount = 0;
		state.emergencyUnreadCount = 0;

		try {
			const res = await fetch('/api/notifications/mark-all-read', {
				method: 'POST'
			});
			if (!res.ok) {
				throw new Error('Failed to mark all notifications as read');
			}

			const data = await res.json();
			const parsed = notificationMarkAllReadResponseSchema.safeParse(data);
			if (!parsed.success || !parsed.data.success) {
				throw new Error('Failed to mark all notifications as read');
			}
		} catch (err) {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.notifications = previousNotifications;
				state.unreadCount = previousUnreadCount;
				state.emergencyUnreadCount = previousEmergencyUnreadCount;
				toastStore.error(m.notifications_mark_all_error());
			}
		} finally {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.isMarkingAll = false;
			}
		}
	},

	async loadMore() {
		if (state.isLoading || state.isLoadingMore || !state.hasMore) return;
		state.isLoadingMore = true;

		const nextPage = state.pagination.pageIndex + 2;
		const pageSize = state.pagination.pageSize;

		try {
			const res = await fetch(`/api/notifications?page=${nextPage}&pageSize=${pageSize}`);
			if (!res.ok) {
				throw new Error('Failed to load notifications');
			}

			const data = await res.json();
			const parsed = notificationListResponseSchema.safeParse(data);
			if (!parsed.success) {
				throw new Error('Invalid notifications response');
			}

			const {
				notifications: newNotifications,
				unreadCount,
				emergencyUnreadCount,
				pagination
			} = parsed.data;
			const newPageIndex = Math.min(
				Math.max(0, pagination.page - 1),
				Math.max(0, pagination.totalPages - 1)
			);

			state.notifications = [...state.notifications, ...newNotifications];
			state.unreadCount = unreadCount;
			state.emergencyUnreadCount = emergencyUnreadCount;
			state.pagination = {
				pageIndex: newPageIndex,
				pageSize: pagination.pageSize,
				total: pagination.total,
				pageCount: pagination.totalPages
			};
			state.hasMore = newPageIndex + 1 < pagination.totalPages;
		} catch {
			toastStore.error(m.notifications_load_error());
		} finally {
			state.isLoadingMore = false;
		}
	}
};
