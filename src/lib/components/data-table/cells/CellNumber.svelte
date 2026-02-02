<!--
@component CellNumber
Number cell renderer with tabular-nums and optional formatting.
-->
<script lang="ts">
	type Props = {
		/** Number value to display */
		value: number | null | undefined;
		/** Locale for number formatting */
		locale?: string;
		/** Number of decimal places */
		decimals?: number;
		/** Optional prefix (e.g., "$") */
		prefix?: string;
		/** Optional suffix (e.g., "%") */
		suffix?: string;
		/** Whether to show a placeholder for null/undefined */
		placeholder?: string;
	};

	let { value, locale, decimals, prefix = '', suffix = '', placeholder = '—' }: Props = $props();

	const formattedValue = $derived.by(() => {
		if (value == null) return null;

		const options: Intl.NumberFormatOptions = {};
		if (decimals !== undefined) {
			options.minimumFractionDigits = decimals;
			options.maximumFractionDigits = decimals;
		}

		return new Intl.NumberFormat(locale, options).format(value);
	});

	const displayValue = $derived(
		formattedValue !== null ? `${prefix}${formattedValue}${suffix}` : placeholder
	);
</script>

<span class="cell-number" class:empty={formattedValue === null}>
	{displayValue}
</span>

<style>
	.cell-number {
		font-variant-numeric: tabular-nums;
		text-align: right;
		display: block;
	}

	.cell-number.empty {
		color: var(--text-faint);
	}
</style>
