import type { Component } from 'svelte';
import type { NotificationType } from '$lib/schemas/api/notifications';

import AlertCircleIcon from '$lib/components/icons/AlertCircleIcon.svelte';
import AlertTriangleIcon from '$lib/components/icons/AlertTriangleIcon.svelte';
import Announcement from '$lib/components/icons/Announcement.svelte';
import Award from '$lib/components/icons/Award.svelte';
import MessageExclamation from '$lib/components/icons/MessageExclamation.svelte';
import CalendarAdd from '$lib/components/icons/CalendarAdd.svelte';
import CalendarMinus from '$lib/components/icons/CalendarMinus.svelte';
import CalendarSad from '$lib/components/icons/CalendarSad.svelte';
import Clock from '$lib/components/icons/Clock.svelte';
import Dollar from '$lib/components/icons/Dollar.svelte';
import Gavel from '$lib/components/icons/Gavel.svelte';
import Lock from '$lib/components/icons/Lock.svelte';
import Route from '$lib/components/icons/Route.svelte';

type NotificationTypeConfig = {
	icon: Component;
	color: string;
};

export const notificationTypeConfig: Record<NotificationType, NotificationTypeConfig> = {
	bid_open: { icon: Gavel, color: '--status-info' },
	bid_won: { icon: CalendarAdd, color: '--status-success' },
	bid_lost: { icon: CalendarSad, color: '--text-muted' },
	shift_reminder: { icon: Clock, color: '--status-info' },
	shift_cancelled: { icon: CalendarMinus, color: '--status-error' },
	assignment_confirmed: { icon: CalendarAdd, color: '--status-success' },
	confirmation_reminder: { icon: Clock, color: '--status-warning' },
	shift_auto_dropped: { icon: CalendarMinus, color: '--status-error' },
	emergency_route_available: { icon: Route, color: '--status-warning' },
	streak_advanced: { icon: Award, color: '--status-success' },
	streak_reset: { icon: AlertCircleIcon, color: '--status-warning' },
	bonus_eligible: { icon: Dollar, color: '--status-success' },
	corrective_warning: { icon: AlertTriangleIcon, color: '--status-warning' },
	schedule_locked: { icon: Lock, color: '--interactive-accent' },
	warning: { icon: AlertTriangleIcon, color: '--status-warning' },
	manual: { icon: MessageExclamation, color: '--status-warning' },
	route_unfilled: { icon: Route, color: '--status-warning' },
	route_cancelled: { icon: CalendarMinus, color: '--status-error' },
	driver_no_show: { icon: AlertCircleIcon, color: '--status-error' }
};
