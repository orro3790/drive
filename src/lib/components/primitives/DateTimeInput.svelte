<!--
@component DateTimeInput
A datetime-local input with consistent styling.

## Props
- `value`: string (bindable) - ISO datetime string (YYYY-MM-DDTHH:MM)
- `disabled`: boolean - disable interaction
- `id`/`name`: string - form field attributes
- `error`: boolean - show error styling
-->
<script lang="ts">
	let {
		value = $bindable(''),
		disabled = false,
		id,
		name,
		error = false,
		ariaLabel,
		onInput,
		onBlur
	} = $props<{
		value?: string | null;
		disabled?: boolean;
		id?: string;
		name?: string;
		error?: boolean;
		ariaLabel?: string;
		onInput?: (value: string) => void;
		onBlur?: () => void;
	}>();

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		onInput?.(target.value);
	}

	function handleBlur() {
		onBlur?.();
	}
</script>

<input
	type="datetime-local"
	{id}
	{name}
	class="datetime-input"
	class:error
	{disabled}
	aria-label={ariaLabel}
	value={value ?? ''}
	oninput={handleInput}
	onblur={handleBlur}
/>

<style>
	.datetime-input {
		display: flex;
		height: 36px;
		width: 100%;
		border-radius: var(--radius-base);
		border: 1px solid var(--border-primary);
		background: var(--surface-primary);
		padding: 0 var(--spacing-2);
		font-family: inherit;
		font-size: var(--font-size-base);
		color: var(--text-normal);
		transition: border-color var(--transition-duration-100) var(--transition-ease);
	}

	.datetime-input:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.datetime-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.datetime-input.error {
		border-color: var(--status-error);
	}

	/* Style the calendar/clock picker icons */
	.datetime-input::-webkit-calendar-picker-indicator {
		cursor: pointer;
		filter: invert(0.5);
	}
</style>
