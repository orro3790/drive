import {
	addDaysToDateString,
	getDayOfWeekFromDateString,
	getTorontoDateTimeInstant,
	toTorontoDateString
} from '$lib/server/time/toronto';

function toTorontoSundayLockInstant(dateString: string): Date {
	const deadline = getTorontoDateTimeInstant(dateString, {
		hours: 23,
		minutes: 59,
		seconds: 59
	});
	deadline.setUTCMilliseconds(999);
	return deadline;
}

export function getCurrentPreferenceLockDeadline(referenceInstant: Date): Date {
	const torontoDate = toTorontoDateString(referenceInstant);
	const dayOfWeek = getDayOfWeekFromDateString(torontoDate);
	const daysToCurrentSunday = dayOfWeek === 0 ? 0 : -dayOfWeek;
	const currentSunday = addDaysToDateString(torontoDate, daysToCurrentSunday);

	return toTorontoSundayLockInstant(currentSunday);
}

export function getNextPreferenceLockDeadline(referenceInstant: Date): Date {
	const torontoDate = toTorontoDateString(referenceInstant);
	const dayOfWeek = getDayOfWeekFromDateString(torontoDate);
	const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
	const nextSunday = addDaysToDateString(torontoDate, daysUntilSunday);

	return toTorontoSundayLockInstant(nextSunday);
}

export function isCurrentPreferenceCycleLocked(
	lockedAt: Date | null,
	referenceInstant: Date
): boolean {
	if (!lockedAt) return false;
	return lockedAt >= getCurrentPreferenceLockDeadline(referenceInstant);
}
