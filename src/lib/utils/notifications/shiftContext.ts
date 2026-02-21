/**
 * Locale-aware formatting for shift date/time in notifications.
 *
 * Uses Intl.DateTimeFormat so date names, time periods, and connectors
 * render correctly in the recipient's language.
 */

export function formatNotificationRouteStartTime(
	startTime: string | null | undefined,
	locale: string = 'en'
): string {
	if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
		return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
			new Date(2000, 0, 1, 9, 0)
		);
	}

	const [hour, minute] = startTime.split(':').map(Number);
	return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
		new Date(2000, 0, 1, hour, minute)
	);
}

export function formatNotificationShiftContext(
	assignmentDate: string | null | undefined,
	routeStartTime: string | null | undefined,
	locale: string = 'en'
): string {
	const hasDate = Boolean(assignmentDate);
	const hasTime = Boolean(routeStartTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(routeStartTime!));

	if (!hasDate && !hasTime) {
		return '';
	}

	if (!hasDate) {
		return formatNotificationRouteStartTime(routeStartTime, locale);
	}

	const [year, month, day] = (assignmentDate as string).split('-').map(Number);

	if (!hasTime) {
		return new Intl.DateTimeFormat(locale, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		}).format(new Date(year, month - 1, day));
	}

	const [hour, minute] = routeStartTime!.split(':').map(Number);
	const date = new Date(year, month - 1, day, hour, minute);

	return new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
}
