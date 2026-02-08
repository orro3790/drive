/**
 * Shared lifecycle label and chip-variant maps for driver UI surfaces.
 *
 * Extracted from dashboard and schedule pages to eliminate duplication.
 */

import * as m from '$lib/paraglide/messages.js';
import {
	cancelReasonValues,
	type AssignmentStatus,
	type CancelReason
} from '$lib/schemas/assignment';
import type { BidStatus } from '$lib/stores/bidsStore.svelte';
import type { SelectOption } from '$lib/schemas/ui/select';

export type ChipStatus = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export const statusLabels: Record<AssignmentStatus, string> = {
	scheduled: m.schedule_status_scheduled(),
	active: m.schedule_status_active(),
	completed: m.schedule_status_completed(),
	cancelled: m.schedule_status_cancelled(),
	unfilled: m.schedule_status_unfilled()
};

export const statusChipVariants: Record<AssignmentStatus, ChipStatus> = {
	scheduled: 'info',
	active: 'warning',
	completed: 'success',
	cancelled: 'neutral',
	unfilled: 'warning'
};

export const cancelReasonLabels: Record<CancelReason, string> = {
	vehicle_breakdown: m.schedule_cancel_reason_vehicle_breakdown(),
	medical_emergency: m.schedule_cancel_reason_medical_emergency(),
	family_emergency: m.schedule_cancel_reason_family_emergency(),
	traffic_accident: m.schedule_cancel_reason_traffic_accident(),
	weather_conditions: m.schedule_cancel_reason_weather_conditions(),
	personal_emergency: m.schedule_cancel_reason_personal_emergency(),
	other: m.schedule_cancel_reason_other()
};

export const cancelReasonOptions: SelectOption[] = cancelReasonValues.map((reason) => ({
	value: reason,
	label: cancelReasonLabels[reason]
}));

export const bidStatusLabels: Record<BidStatus, string> = {
	pending: m.bids_status_pending(),
	won: m.bids_status_won(),
	lost: m.bids_status_lost()
};

export const bidStatusChipVariants: Record<BidStatus, ChipStatus> = {
	pending: 'info',
	won: 'success',
	lost: 'neutral'
};
