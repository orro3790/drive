<!--
@component CellDate
Date cell renderer using the app's date formatting utility.
-->
<script lang="ts">
	import { formatUiDate, formatUiDateTime } from '$lib/utils/date/formatting';

	type Props = {
		/** Date value to display */
		value: Date | null | undefined;
		/** Whether to include time */
		includeTime?: boolean;
		/** Placeholder for null/undefined values */
		placeholder?: string;
	};

	let { value, includeTime = false, placeholder = '—' }: Props = $props();

	const formattedValue = $derived.by(() => {
		if (value == null) return null;
		// Handle Firestore Timestamp-like objects
		if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
			value = value.toDate() as Date;
		}
		if (!(value instanceof Date) || isNaN(value.getTime())) return null;
		return includeTime ? formatUiDateTime(value) : formatUiDate(value);
	});

	const displayValue = $derived(formattedValue ?? placeholder);
</script>

<span class="cell-date" class:empty={formattedValue === null}>
	{displayValue}
</span>

<style>
	.cell-date {
		color: var(--text-normal);
	}

	.cell-date.empty {
		color: var(--text-faint);
	}
</style>
