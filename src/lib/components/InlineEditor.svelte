<!--
	InlineEditor - An inline editable text field.

	Displays text that becomes editable on click/focus.
	Used for inline editing patterns like form inputs.

	## Size Guide
	- **small/sm**: Compact rows, data tables. Height: 32px.
	- **base**: Form fields. Login, settings. Height: 36px.
	- **large**: Emphasized inputs. Height: 44px.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type EditorMode = 'inline' | 'form';
	type EditorSize = 'sm' | 'small' | 'base' | 'large';
	type EditorVariant = 'seamless' | 'bordered';

	let {
		value = '',
		placeholder = '',
		disabled = false,
		required = false,
		id,
		name,
		mode = 'inline',
		size = 'base',
		variant = 'bordered',
		inputmode,
		inputType = 'text',
		autocomplete,
		class: className = '',
		onInput,
		onSave,
		onBlur,
		onblur,
		onKeyDown,
		leadingIcon,
		trailingIcon,
		ariaLabel
	} = $props<{
		/** Current value */
		value?: string;
		/** Placeholder text when empty */
		placeholder?: string;
		/** Whether editing is disabled */
		disabled?: boolean;
		/** Whether the input is required */
		required?: boolean;
		/** Input ID for label association */
		id?: string;
		/** Input name attribute */
		name?: string;
		/** Display mode: inline (transparent) or form (bordered) */
		mode?: EditorMode;
		/** Size variant */
		size?: EditorSize;
		/** Visual variant */
		variant?: EditorVariant;
		/** HTML inputmode attribute for mobile keyboards */
		inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
		/** HTML input type */
		inputType?: 'text' | 'tel' | 'email' | 'url' | 'password' | 'number';
		/** Autocomplete attribute */
		autocomplete?: string;
		/** Additional CSS classes */
		class?: string;
		/** Called on each input change */
		onInput?: (value: string) => void;
		/** Called when editing is complete */
		onSave?: (value: string) => void;
		/** Called on blur (camelCase) */
		onBlur?: () => void;
		/** Called on blur (lowercase, for consistency with native events) */
		onblur?: () => void;
		/** Called on keydown */
		onKeyDown?: (event: KeyboardEvent) => void;
		/** Optional leading icon snippet */
		leadingIcon?: Snippet;
		/** Optional trailing icon snippet */
		trailingIcon?: Snippet;
		/** Aria label for accessibility */
		ariaLabel?: string;
	}>();

	let inputElement = $state<HTMLInputElement | null>(null);
	let localValue = $state('');

	// Normalize size aliases
	const normalizedSize = $derived(size === 'sm' ? 'small' : size);

	// Sync external value to local state
	$effect(() => {
		localValue = value;
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		localValue = target.value;
		onInput?.(localValue);
	}

	function handleBlur() {
		onSave?.(localValue);
		onBlur?.();
		onblur?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		onKeyDown?.(e);
		if (e.key === 'Enter' && !onKeyDown) {
			inputElement?.blur();
		} else if (e.key === 'Escape') {
			localValue = value;
			inputElement?.blur();
		}
	}

	// Export input element for external access (e.g., focus)
	export function focus() {
		inputElement?.focus();
	}

	export function blur() {
		inputElement?.blur();
	}

	export function select() {
		inputElement?.select();
	}
</script>

<div class="ie-row {normalizedSize} {variant}" class:disabled>
	{#if leadingIcon}
		<div class="ie-leading">
			{@render leadingIcon()}
		</div>
	{/if}

	<input
		bind:this={inputElement}
		type={inputType}
		{id}
		{name}
		class="editable-input {className}"
		{placeholder}
		{disabled}
		{required}
		{inputmode}
		{autocomplete}
		aria-label={ariaLabel}
		value={localValue}
		oninput={handleInput}
		onblur={handleBlur}
		onkeydown={handleKeydown}
	/>

	{#if trailingIcon}
		<div class="ie-trailing">
			{@render trailingIcon()}
		</div>
	{/if}
</div>

<style>
	.ie-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--spacing-2);
		border-radius: var(--radius-base);
		border: var(--border-width-thin) solid transparent;
		background-color: transparent;
		width: 100%;
		box-sizing: border-box;
	}

	/* When no icons are present, collapse to single column */
	.ie-row:not(:has(.ie-leading)):not(:has(.ie-trailing)) {
		grid-template-columns: 1fr;
	}

	/* Variant: seamless (transparent) */
	.ie-row.seamless {
		border-color: transparent;
		background-color: transparent;
	}

	/* Variant: bordered (visible container) */
	.ie-row.bordered {
		border-color: var(--border-primary);
		background-color: var(--surface-primary);
	}

	/* Focus state */
	.ie-row:focus-within {
		border-color: var(--interactive-accent);
	}

	/* Disabled state */
	.ie-row.disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	/* Size: small (32px) */
	.ie-row.small {
		min-height: 32px;
		padding: var(--spacing-1) var(--spacing-2);
	}

	/* Size: base (36px) - default for form fields */
	.ie-row.base {
		min-height: 36px;
		padding: var(--spacing-2);
	}

	/* Size: large (44px) */
	.ie-row.large {
		min-height: 44px;
		padding: var(--spacing-2);
	}

	/* Icon containers */
	.ie-leading,
	.ie-trailing {
		display: grid;
		place-items: center;
		color: var(--text-muted);
	}

	/* Input element */
	.editable-input {
		width: 100%;
		font-family: inherit;
		font-size: var(--font-size-base);
		color: var(--text-normal);
		border: none;
		background: transparent;
		padding: 0;
		margin: 0;
		outline: none;
	}

	.editable-input::placeholder {
		color: var(--text-muted);
	}

	.editable-input:disabled {
		cursor: not-allowed;
		color: var(--text-muted);
	}

	/* Seamless variant hover effect */
	.ie-row.seamless:hover:not(.disabled):not(:focus-within) {
		background-color: color-mix(in srgb, var(--interactive-hover) 50%, transparent);
		cursor: text;
	}
</style>
