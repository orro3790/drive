import { format, parseISO } from 'date-fns';

export function formatNotificationRouteStartTime(startTime: string | null | undefined): string {
	if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
		return '9:00 AM';
	}

	const [hour24, minute] = startTime.split(':').map(Number);
	const period = hour24 >= 12 ? 'PM' : 'AM';
	const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

	return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatNotificationShiftContext(
	assignmentDate: string | null | undefined,
	routeStartTime: string | null | undefined
): string {
	const hasDate = Boolean(assignmentDate);
	const hasTime = Boolean(routeStartTime);

	if (!hasDate && !hasTime) {
		return '';
	}

	const timeLabel = hasTime ? formatNotificationRouteStartTime(routeStartTime) : '';

	if (!hasDate) {
		return timeLabel;
	}

	let dateLabel = assignmentDate as string;
	try {
		dateLabel = format(parseISO(assignmentDate as string), 'EEE, MMM d');
	} catch {
		dateLabel = assignmentDate as string;
	}

	if (!hasTime) {
		return dateLabel;
	}

	return `${dateLabel} at ${timeLabel}`;
}
