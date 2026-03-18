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
	const formatter = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
	if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
		return formatLocalizedTimeParts(formatter, new Date(2000, 0, 1, 9, 0), locale);
	}

	const [hour, minute] = startTime.split(':').map(Number);
	return formatLocalizedTimeParts(formatter, new Date(2000, 0, 1, hour, minute), locale);
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

	const formatter = new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	return formatLocalizedTimeParts(formatter, date, locale);
}

function formatLocalizedTimeParts(
	formatter: Intl.DateTimeFormat,
	date: Date,
	locale: string
): string {
	const localizedDayPeriods = getLocalizedDayPeriods(locale);
	if (!localizedDayPeriods) {
		return formatter.format(date);
	}

	return formatter
		.formatToParts(date)
		.map((part) => {
			if (part.type !== 'dayPeriod') {
				return part.value;
			}

			const normalized = part.value.toLowerCase();
			if (normalized === 'am') {
				return localizedDayPeriods.am;
			}
			if (normalized === 'pm') {
				return localizedDayPeriods.pm;
			}
			return part.value;
		})
		.join('');
}

function getLocalizedDayPeriods(locale: string): { am: string; pm: string } | null {
	if (locale.startsWith('ko')) {
		return { am: '오전', pm: '오후' };
	}

	return null;
}
