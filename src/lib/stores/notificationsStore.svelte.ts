/**
 * Notifications Store
 *
 * Manages notification inbox state, pagination, and read actions.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
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

const state = $state<{
	notifications: Notification[];
	unreadCount: number;
	pagination: PaginationState;
	isLoading: boolean;
	isMarkingAll: boolean;
	error: string | null;
}>({
	notifications: [],
	unreadCount: 0,
	pagination: {
		pageIndex: 0,
		pageSize: 20,
		total: 0,
		pageCount: 1
	},
	isLoading: false,
	isMarkingAll: false,
	error: null
});

export const notificationsStore = {
	get notifications() {
		return state.notifications;
	},
	get unreadCount() {
		return state.unreadCount;
	},
	get pagination() {
		return state.pagination;
	},
	get isLoading() {
		return state.isLoading;
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

			const { notifications, unreadCount, pagination } = parsed.data;
			const pageIndex = Math.min(
				Math.max(0, pagination.page - 1),
				Math.max(0, pagination.totalPages - 1)
			);
			state.notifications = notifications;
			state.unreadCount = unreadCount;
			state.pagination = {
				pageIndex,
				pageSize: pagination.pageSize,
				total: pagination.total,
				pageCount: pagination.totalPages
			};
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.notifications_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	async markRead(notificationId: string) {
		const target = state.notifications.find((item) => item.id === notificationId);
		if (!target || target.read) return;

		const previousNotifications = state.notifications;
		const previousUnreadCount = state.unreadCount;

		state.notifications = previousNotifications.map((item) =>
			item.id === notificationId ? { ...item, read: true } : item
		);
		state.unreadCount = Math.max(0, previousUnreadCount - 1);

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
			state.notifications = previousNotifications;
			state.unreadCount = previousUnreadCount;
			toastStore.error(m.notifications_mark_read_error());
		}
	},

	async markAllRead() {
		if (state.isMarkingAll || state.unreadCount === 0) return;
		state.isMarkingAll = true;

		const previousNotifications = state.notifications;
		const previousUnreadCount = state.unreadCount;
		state.notifications = previousNotifications.map((item) => ({ ...item, read: true }));
		state.unreadCount = 0;

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
			state.notifications = previousNotifications;
			state.unreadCount = previousUnreadCount;
			toastStore.error(m.notifications_mark_all_error());
		} finally {
			state.isMarkingAll = false;
		}
	}
};
