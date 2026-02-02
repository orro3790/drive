/**
 * Client-side types and constants for call log forms.
 * Mirrors server validation schemas for consistency.
 */

export const callOutcomeValues = [
	'no_answer',
	'gatekeeper',
	'decision_maker',
	'refused',
	'interested',
	'not_interested'
] as const;

export type CallOutcome = (typeof callOutcomeValues)[number];

export const callObjectionValues = [
	'too_busy',
	'budget',
	'already_has_system',
	'timing_future',
	'no_need',
	'language_barrier',
	'other'
] as const;

export type CallObjection = (typeof callObjectionValues)[number];

export const callPainPointValues = [
	'scheduling',
	'billing',
	'parent_communication',
	'curriculum',
	'reporting',
	'compliance',
	'other'
] as const;

export type CallPainPoint = (typeof callPainPointValues)[number];

export const interestLevelValues = ['cold', 'warm', 'hot'] as const;

export type InterestLevel = (typeof interestLevelValues)[number];

export const callNextActionValues = [
	'send_info',
	'call_back',
	'visit',
	'no_followup',
	'other'
] as const;

export type CallNextAction = (typeof callNextActionValues)[number];

/**
 * Actions that require a follow-up date.
 */
export const actionsRequiringFollowup: readonly CallNextAction[] = [
	'send_info',
	'call_back',
	'visit'
];

/**
 * Outcomes that should show objection field.
 */
export const outcomesWithObjection: readonly CallOutcome[] = ['refused', 'not_interested'];

/**
 * Call log data shape for the form.
 */
export interface CallLogFormData {
	id: string;
	outcome: CallOutcome | null;
	objection: CallObjection | null;
	objectionNotes: string | null;
	painPoints: CallPainPoint[] | null;
	interestLevel: InterestLevel | null;
	nextAction: CallNextAction | null;
	nextFollowupAt: string | null; // ISO string for datetime-local input
	notes: string | null;
	status: 'draft' | 'complete';
}

/**
 * Validate form data for completion.
 * Returns array of field names with errors.
 */
export function validateForCompletion(data: CallLogFormData): string[] {
	const errors: string[] = [];

	if (!data.outcome) errors.push('outcome');
	if (!data.interestLevel) errors.push('interestLevel');
	if (!data.nextAction) errors.push('nextAction');

	if (
		data.nextAction &&
		actionsRequiringFollowup.includes(data.nextAction) &&
		!data.nextFollowupAt
	) {
		errors.push('nextFollowupAt');
	}

	return errors;
}
