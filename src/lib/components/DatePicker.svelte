<!--
  File: src/lib/components/DatePicker.svelte
  A custom, accessible, and reusable date picker component.
  Supports single date selection and date range selection with a reset button.

  Usage:
  
  Single date mode:
  <DatePicker bind:value={selectedDate} placeholder="Select date" />
  
  Range mode:
  <DatePicker 
    mode="range" 
    bind:value={dateRange} 
    placeholder="Select date range"
    align="right"
  />
  
  Where:
  - selectedDate is a string in YYYY-MM-DD format (e.g., "2025-10-11")
  - dateRange is an object: { start: string, end: string }
  - align: 'left' (default) or 'right' to control dropdown alignment
  
  Width behavior:
  - Container width defaults to 100% of parent
  - No hardcoded min-width; input will size based on content and parent constraints
  - Use parent styles (e.g., width, max-width) to control overall sizing
  - The dropdown calendar is portaled and positioned absolutely
  
  The reset button appears automatically when a date/range is selected.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/icons/Calendar.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';
	import { portal } from '$lib/actions/portal';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import type { DateRange, DatePickerMode } from '$lib/schemas/ui/date';
	import { parseLocalYMD } from '$lib/utils/date/firestore';

	type DatePickerProps = {
		value?: string | DateRange;
		placeholder?: string;
		id?: string;
		disabled?: boolean;
		mode?: DatePickerMode;
		align?: 'left' | 'right';
		onchange?: (nextValue: string | DateRange) => void;
	};

	let {
		value = $bindable<string | DateRange>(''), // YYYY-MM-DD format or { start, end }
		placeholder = $bindable<string>(),
		id = `datepicker-${globalThis.crypto.randomUUID()}`,
		disabled = false,
		mode = 'single',
		align = 'left',
		onchange = () => {}
	}: DatePickerProps = $props();

	// Set default placeholder based on mode
	const defaultPlaceholder = $derived(
		mode === 'range' ? m.date_picker_placeholder_range() : m.date_picker_placeholder_single()
	);
	const finalPlaceholder = $derived(placeholder ?? defaultPlaceholder);

	let isOpen = $state(false);
	let containerElement: HTMLDivElement | null = $state(null);
	let inputElement: HTMLInputElement | null = $state(null);
	let calendarElement: HTMLDivElement | null = $state(null);
	let isInvalid = $state(false);

	// Range selection state
	let rangeStart = $state<string | null>(null);
	let rangeEnd = $state<string | null>(null);
	let hoverDate = $state<string | null>(null);

	// Use shared util parseLocalYMD to avoid timezone issues

	// Initialize viewDate based on value or today
	let viewDate = $state<Date>(new Date());
	let currentView: 'days' | 'months' | 'years' = $state('days');
	let displayValue = $state('');

	// Initialize viewDate on mount or when value changes
	$effect(() => {
		if (mode === 'single' && typeof value === 'string' && value) {
			const parsed = parseLocalYMD(value);
			if (parsed) viewDate = parsed;
		} else if (mode === 'range' && typeof value === 'object' && value.start) {
			const parsed = parseLocalYMD(value.start);
			if (parsed) viewDate = parsed;
		}
	});

	// Helper to format display value
	function formatDisplayValue() {
		if (mode === 'single' && typeof value === 'string') {
			if (value) {
				const date = parseLocalYMD(value);
				if (!date) return '';
				const month = (date.getMonth() + 1).toString().padStart(2, '0');
				const day = date.getDate().toString().padStart(2, '0');
				const year = date.getFullYear();
				return `${month}/${day}/${year}`;
			}
		} else if (mode === 'range' && typeof value === 'object' && (value.start || value.end)) {
			const parts: string[] = [];
			if (value.start) {
				const date = parseLocalYMD(value.start);
				if (date) {
					const month = (date.getMonth() + 1).toString().padStart(2, '0');
					const day = date.getDate().toString().padStart(2, '0');
					const year = date.getFullYear();
					parts.push(`${month}/${day}/${year}`);
				}
			}
			if (value.end) {
				const date = parseLocalYMD(value.end);
				if (date) {
					const month = (date.getMonth() + 1).toString().padStart(2, '0');
					const day = date.getDate().toString().padStart(2, '0');
					const year = date.getFullYear();
					parts.push(`${month}/${day}/${year}`);
				}
			}
			return parts.join(' - ') || '';
		}
		return '';
	}

	// Effect to sync the display value from the external `value` prop
	$effect(() => {
		// This updates the calendar view whenever the date changes
		if (mode === 'single' && typeof value === 'string' && value) {
			const parsed = parseLocalYMD(value);
			if (parsed) viewDate = parsed;
		} else if (mode === 'range' && typeof value === 'object' && value.start) {
			const parsed = parseLocalYMD(value.start);
			if (parsed) viewDate = parsed;
			rangeStart = value.start;
			rangeEnd = value.end;
		}

		// We only want to format and set the display value if the input is not focused.
		// This prevents overwriting what the user is actively typing.
		if (document.activeElement !== inputElement) {
			displayValue = formatDisplayValue();
		}
	});

	const daysOfWeek = $derived([
		m.date_picker_day_su(),
		m.date_picker_day_mo(),
		m.date_picker_day_tu(),
		m.date_picker_day_we(),
		m.date_picker_day_th(),
		m.date_picker_day_fr(),
		m.date_picker_day_sa()
	]);

	let calendarGrid = $derived.by(() => {
		const year = viewDate.getFullYear();
		const month = viewDate.getMonth();
		const firstDayOfMonth = new Date(year, month, 1);
		const lastDayOfMonth = new Date(year, month + 1, 0);
		const daysInMonth = lastDayOfMonth.getDate();
		const startDayOfWeek = firstDayOfMonth.getDay();

		const grid: (Date | null)[] = [];

		// Add blank days for the start of the month
		for (let i = 0; i < startDayOfWeek; i++) {
			grid.push(null);
		}

		// Add days of the month
		for (let i = 1; i <= daysInMonth; i++) {
			grid.push(new Date(year, month, i));
		}
		return grid;
	});

	const months = $derived(
		Array.from(
			{
				length: 12
			},
			(_, i) => new Date(viewDate.getFullYear(), i, 1)
		)
	);

	let yearGrid = $derived.by(() => {
		const startYear = viewDate.getFullYear() - 6;
		return Array.from(
			{
				length: 12
			},
			(_, i) => startYear + i
		);
	});

	/**
	 * Formats a Date object to YYYY-MM-DD string format.
	 * @param date - The date to format
	 * @returns Formatted date string in YYYY-MM-DD format
	 */
	function formatDate(date: Date) {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Handles date selection in both single and range modes.
	 * In single mode: directly selects the date and closes the calendar.
	 * In range mode: selects start date first, then end date, automatically swapping if needed.
	 * @param day - The selected date or null
	 */
	function selectDate(day: Date | null) {
		if (!day || disabled) return;
		const dateStr = formatDate(day);

		if (mode === 'single') {
			value = dateStr;
			onchange?.(value);
			isOpen = false;
		} else if (mode === 'range') {
			// Range selection logic
			if (!rangeStart || (rangeStart && rangeEnd)) {
				// Start new range
				rangeStart = dateStr;
				rangeEnd = null;
				value = {
					start: dateStr,
					end: ''
				};
				onchange?.(value);
			} else {
				// Complete the range
				const start = parseLocalYMD(rangeStart);
				const end = parseLocalYMD(dateStr);

				if (start && end && end < start) {
					// Swap if end is before start
					rangeEnd = rangeStart;
					rangeStart = dateStr;
					value = {
						start: dateStr,
						end: rangeStart
					};
				} else {
					rangeEnd = dateStr;
					value = {
						start: rangeStart,
						end: dateStr
					};
				}
				onchange?.(value);
				// Don't auto-close in range mode; let parent handle it
			}
		}
	}

	/**
	 * Resets the date selection to empty state.
	 * Clears the value and closes the calendar.
	 */
	function resetDate() {
		if (mode === 'single') {
			value = '';
			onchange?.('');
		} else if (mode === 'range') {
			rangeStart = null;
			rangeEnd = null;
			value = {
				start: '',
				end: ''
			};
			onchange?.(value);
		}
		isOpen = false;
	}

	/**
	 * Checks if a date is within the selected range (including hover preview).
	 * @param dateStr - Date string in YYYY-MM-DD format
	 * @returns True if the date is within the range
	 */
	function isDateInRange(dateStr: string): boolean {
		if (mode !== 'range' || !rangeStart) return false;

		const date = parseLocalYMD(dateStr);
		const start = parseLocalYMD(rangeStart);
		if (!date || !start) return false;

		if (rangeEnd) {
			const end = parseLocalYMD(rangeEnd);
			if (!end) return false;
			return date >= start && date <= end;
		} else if (hoverDate) {
			// Show preview while hovering
			const hover = parseLocalYMD(hoverDate);
			if (!hover) return false;
			const rangeMin = hover < start ? hover : start;
			const rangeMax = hover < start ? start : hover;
			return date >= rangeMin && date <= rangeMax;
		}

		return false;
	}

	/**
	 * Determines if a date is the start or end of the selected range.
	 * @param dateStr - Date string in YYYY-MM-DD format
	 * @returns 'start', 'end', or null
	 */
	function isRangeEdge(dateStr: string): 'start' | 'end' | null {
		if (mode !== 'range') return null;
		if (rangeStart === dateStr) return 'start';
		if (rangeEnd === dateStr) return 'end';
		return null;
	}

	function changeMonth(offset: number) {
		if (currentView === 'years') {
			viewDate = new Date(viewDate.getFullYear() + offset * 12, 0, 1);
		} else {
			viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
		}
	}

	function selectMonth(month: number) {
		viewDate = new Date(viewDate.getFullYear(), month, 1);
		currentView = 'days';
	}

	function selectYear(year: number) {
		viewDate = new Date(year, viewDate.getMonth(), 1);
		currentView = 'months';
	}

	function handleClickOutside(event: MouseEvent) {
		if (
			containerElement &&
			!containerElement.contains(event.target as Node) &&
			calendarElement &&
			!calendarElement.contains(event.target as Node)
		) {
			isOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside, true);
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
		};
	});

	function parseDate(str: string): Date | null {
		// Try MM/DD/YYYY
		let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (match) {
			const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
			if (!isNaN(date.getTime())) return date;
		}

		// Try YYYY-MM-DD
		match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
		if (match) {
			const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
			if (!isNaN(date.getTime())) return date;
		}

		return null;
	}

	function handleInput(event: Event) {
		// Only handle input in single mode (range mode input is readonly)
		if (mode !== 'single') return;

		const target = event.target as HTMLInputElement;
		displayValue = target.value;
		isInvalid = false; // Clear invalid state while typing

		// If the input is cleared, update the value immediately
		if (displayValue === '') {
			if (value !== '') {
				value = '';
				onchange?.(value);
			}
			return;
		}

		// Try to parse the date as the user types
		const parsed = parseDate(displayValue);
		if (parsed) {
			const nextValue = formatDate(parsed);
			// Update the bound value only if it has actually changed
			if (value !== nextValue) {
				value = nextValue;
				onchange?.(value);
			}
		}
		// If parsing fails, we don't set `isInvalid` yet.
		// We wait for the user to finish typing (onblur).
	}

	function handleBlur() {
		// Only handle blur in single mode
		if (mode !== 'single') return;

		// When the user leaves the input, we validate and format
		if (displayValue === '') {
			isInvalid = false;
			return;
		}

		const parsed = parseDate(displayValue);
		if (parsed) {
			// Valid date; compute display directly from parsed local Date
			const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
			const day = parsed.getDate().toString().padStart(2, '0');
			const year = parsed.getFullYear();
			displayValue = `${month}/${day}/${year}`;
			isInvalid = false;
		} else {
			// Invalid date, mark it as such
			isInvalid = true;
		}
	}

	// Effect to position the calendar dropdown when it opens
	$effect(() => {
		if (isOpen && inputElement && calendarElement) {
			const inputRect = inputElement.getBoundingClientRect();

			// Base position: below the input
			let top = inputRect.bottom + window.scrollY + 4;
			let left = inputRect.left + window.scrollX;

			calendarElement.style.position = 'absolute';
			calendarElement.style.zIndex = 'var(--z-popover)';

			// --- Viewport collision detection ---
			// Must be done after setting position to get correct dimensions
			const calendarRect = calendarElement.getBoundingClientRect();

			// Handle horizontal alignment
			if (align === 'right') {
				// Right-align the dropdown with the input's right edge
				left = inputRect.right + window.scrollX - calendarRect.width;
			}

			// Ensure it doesn't overflow left edge
			if (left < window.scrollX) {
				left = window.scrollX + 8;
			}

			// If it overflows to the right, push it left
			if (left + calendarRect.width > window.scrollX + window.innerWidth) {
				left = inputRect.right + window.scrollX - calendarRect.width;
			}

			calendarElement.style.left = `${left}px`;
			calendarElement.style.top = `${top}px`;

			// If it overflows below, flip to above
			if (calendarRect.bottom > window.innerHeight && calendarRect.height < inputRect.top) {
				top = inputRect.top + window.scrollY - calendarRect.height - 4;
				calendarElement.style.top = `${top}px`;
			}
		}
	});
</script>

<div class="datepicker-container" class:range-mode={mode === 'range'} bind:this={containerElement}>
	<div class="input-wrapper">
		<input
			type="text"
			{id}
			{disabled}
			class="datepicker-input"
			class:invalid={isInvalid}
			placeholder={finalPlaceholder}
			bind:this={inputElement}
			value={displayValue}
			oninput={handleInput}
			onblur={handleBlur}
			onfocus={() => (isOpen = true)}
			readonly={mode === 'range'}
		/>
		<button
			type="button"
			class="icon-wrapper"
			aria-label={m.date_picker_toggle_calendar()}
			onclick={() => (isOpen = !isOpen)}
			{disabled}
		>
			<Icon>
				<Calendar />
			</Icon>
		</button>
	</div>

	{#if isOpen}
		<div
			class="calendar-dropdown"
			role="dialog"
			aria-modal="true"
			data-datepicker-calendar
			use:portal
			bind:this={calendarElement}
		>
			<div class="calendar-header">
				<IconButton tooltip={m.date_picker_prev_month()} onclick={() => changeMonth(-1)}>
					<Icon><ChevronLeft /></Icon>
				</IconButton>
				<div class="view-switch-container">
					<Button variant="ghost" size="small" onclick={() => (currentView = 'months')}>
						{viewDate.toLocaleString('default', {
							month: 'long'
						})}
					</Button>
					<Button variant="ghost" size="small" onclick={() => (currentView = 'years')}>
						{viewDate.getFullYear()}
					</Button>
				</div>
				<IconButton tooltip={m.date_picker_next_month()} onclick={() => changeMonth(1)}>
					<Icon><ChevronRight /></Icon>
				</IconButton>
			</div>
			{#if currentView === 'days'}
				<div class="calendar-grid day-view">
					{#each daysOfWeek as dayName (dayName)}
						<div class="day-name">{dayName}</div>
					{/each}
					{#each calendarGrid as day, index (index)}
						{@const dateStr = day ? formatDate(day) : ''}
						{@const isSelected =
							day &&
							(mode === 'single'
								? dateStr === value
								: dateStr === rangeStart || dateStr === rangeEnd)}
						{@const inRange = day && mode === 'range' && isDateInRange(dateStr)}
						{@const edge = day && mode === 'range' ? isRangeEdge(dateStr) : null}
						<button
							type="button"
							class="day"
							class:blank={!day}
							class:selected={isSelected}
							class:in-range={inRange}
							class:range-start={edge === 'start'}
							class:range-end={edge === 'end'}
							class:today={day && dateStr === formatDate(new Date())}
							onclick={() => selectDate(day)}
							onmouseenter={() => {
								if (mode === 'range' && day) hoverDate = dateStr;
							}}
							onmouseleave={() => {
								if (mode === 'range') hoverDate = null;
							}}
							disabled={!day}
						>
							{day?.getDate()}
						</button>
					{/each}
				</div>
			{:else if currentView === 'months'}
				<div class="calendar-grid month-view">
					{#each months as month, i (i)}
						<Button variant="ghost" size="small" onclick={() => selectMonth(i)}>
							{month.toLocaleString('default', {
								month: 'short'
							})}
						</Button>
					{/each}
				</div>
			{:else if currentView === 'years'}
				<div class="calendar-grid year-view">
					{#each yearGrid as year (year)}
						<Button variant="ghost" size="small" onclick={() => selectYear(year)}>
							{year}
						</Button>
					{/each}
				</div>
			{/if}
			<div class="calendar-footer">
				<Button variant="ghost" size="small" fill onclick={resetDate}>
					{m.date_picker_clear()}
				</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.datepicker-container {
		position: relative;
		width: 100%;
	}

	.input-wrapper {
		position: relative;
	}

	.datepicker-input {
		width: 100%;
		padding: var(--spacing-2);
		padding-right: calc(
			var(--spacing-2) + var(--spacing-3) + var(--spacing-2)
		); /* Right padding for icon */
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-primary);
		box-shadow: none;
		border-radius: var(--radius-base);
		color: var(--text-normal);
		font-size: var(--font-size-base);
		height: 36px; /* Match Select component default height */
		box-sizing: border-box;
		transition:
			background-color var(--transition-duration-200) var(--transition-ease),
			box-shadow var(--transition-duration-200) var(--transition-ease);
	}

	.input-wrapper:hover .datepicker-input:not(:disabled) {
		background: var(--interactive-hover);
	}

	.datepicker-input:focus {
		outline: none;
		box-shadow: 0 0 0 1px var(--interactive-accent);
	}

	.datepicker-input.invalid {
		box-shadow: 0 0 0 1px var(--status-error);
	}

	.icon-wrapper {
		position: absolute;
		right: var(--spacing-2);
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		background: none;
		border: none;
		padding: 0;
	}

	.icon-wrapper:disabled {
		opacity: 0.5;
	}

	.calendar-dropdown {
		background: var(--surface-inset);
		border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-2);
		box-shadow: var(--shadow-base);
		/* 7 columns × 28px + 6 gaps × 4px + 2 × padding 8px = 196 + 24 + 16 = 236px min */
		min-width: calc(7 * var(--spacing-5) + 6 * var(--spacing-1) + 2 * var(--spacing-2));
		width: max-content;
		/* z-index is set programmatically */
	}

	.calendar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-1) 0;
	}

	.view-switch-container {
		display: flex;
		gap: var(--spacing-2);
		flex-grow: 1;
		justify-content: center;
		align-items: center;
	}

	.calendar-grid {
		display: grid;
		gap: var(--spacing-1);
	}

	.calendar-footer {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		margin-top: var(--spacing-2);
		padding-top: var(--spacing-2);
		border-top: var(--border-width-thin) solid var(--border-primary);
	}

	/* Day view: 7 columns of 28×28px cells */
	.day-view {
		grid-template-columns: repeat(7, var(--spacing-5));
		justify-content: center;
	}

	/* Month/Year views: 3 columns, Button handles styling */
	.month-view,
	.year-view {
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-2);
	}

	.day-name,
	.day {
		display: flex;
		justify-content: center;
		align-items: center;
		width: var(--spacing-5); /* 28px - matches IconButton */
		height: var(--spacing-5); /* 28px - matches IconButton */
		font-size: var(--font-size-base);
		background: none;
		border: none;
		color: var(--text-normal);
		border-radius: var(--radius-base);
		cursor: pointer;
		transition:
			background-color var(--transition-duration-200) var(--transition-ease),
			color var(--transition-duration-200) var(--transition-ease);
	}

	.day-name {
		color: var(--text-muted);
		cursor: default;
	}

	.day:not(.blank):hover {
		background-color: var(--interactive-hover);
	}

	.day.today {
		border: var(--border-width-thin) solid var(--text-muted);
	}

	.day.selected {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
		border: var(--border-width-thin) solid transparent;
	}

	.day.in-range {
		background-color: var(--interactive-hover);
		color: var(--text-normal);
	}

	.day.range-start {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	.day.range-end {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	.day.range-start.range-end {
		border-radius: var(--radius-base);
	}

	.day.blank {
		cursor: default;
		opacity: 0;
		pointer-events: none;
	}
</style>
