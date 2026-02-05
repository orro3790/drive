import type { Component } from 'svelte';
import type { NotificationType } from '$lib/schemas/api/notifications';

import AlertCircleIcon from '$lib/components/icons/AlertCircleIcon.svelte';
import AlertTriangleIcon from '$lib/components/icons/AlertTriangleIcon.svelte';
import Announcement from '$lib/components/icons/Announcement.svelte';
import CalendarExclamation from '$lib/components/icons/CalendarExclamation.svelte';
import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
import Clock from '$lib/components/icons/Clock.svelte';
import Crown from '$lib/components/icons/Crown.svelte';
import Gavel from '$lib/components/icons/Gavel.svelte';
import Lock from '$lib/components/icons/Lock.svelte';
import Route from '$lib/components/icons/Route.svelte';
import XCircle from '$lib/components/icons/XCircle.svelte';

type NotificationTypeConfig = {
	icon: Component;
	color: string;
};

export const notificationTypeConfig: Record<NotificationType, NotificationTypeConfig> = {
	bid_open: { icon: Gavel, color: '--status-info' },
	bid_won: { icon: Crown, color: '--status-success' },
	bid_lost: { icon: XCircle, color: '--text-muted' },
	shift_reminder: { icon: Clock, color: '--status-info' },
	shift_cancelled: { icon: CalendarExclamation, color: '--status-error' },
	assignment_confirmed: { icon: CheckCircleIcon, color: '--status-success' },
	schedule_locked: { icon: Lock, color: '--interactive-accent' },
	warning: { icon: AlertTriangleIcon, color: '--status-warning' },
	manual: { icon: Announcement, color: '--text-muted' },
	route_unfilled: { icon: Route, color: '--status-warning' },
	route_cancelled: { icon: CalendarExclamation, color: '--status-error' },
	driver_no_show: { icon: AlertCircleIcon, color: '--status-error' }
};
