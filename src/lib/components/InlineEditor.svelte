<!--
	InlineEditor - An inline editable text field.

	Displays text that becomes editable on click/focus.
	Used for inline editing patterns like phone numbers and time inputs.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type EditorMode = 'inline' | 'form';
	type EditorSize = 'sm' | 'md' | 'lg' | 'xl' | 'base' | 'small';
	type EditorVariant = 'default' | 'bordered';

	let {
		value = '',
		placeholder = '',
		disabled = false,
		required = false,
		id,
		name,
		mode = 'inline',
		size = 'md',
		variant = 'default',
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
		/** Aria label for accessibility */
		ariaLabel?: string;
	}>();

	let inputElement = $state<HTMLInputElement | null>(null);
	let localValue = $state('');

	// Map size aliases
	const normalizedSize = $derived(size === 'base' ? 'md' : size === 'small' ? 'sm' : size);

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

<div class="inline-editor-wrapper" class:has-leading-icon={leadingIcon}>
	{#if leadingIcon}
		<span class="leading-icon">
			{@render leadingIcon()}
		</span>
	{/if}
	<input
		bind:this={inputElement}
		type={inputType}
		{id}
		{name}
		class="inline-editor mode-{mode} size-{normalizedSize} variant-{variant} {className}"
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
</div>

<style>
	.inline-editor-wrapper {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.inline-editor-wrapper.has-leading-icon {
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		background: var(--surface-base);
	}

	.inline-editor-wrapper.has-leading-icon .inline-editor {
		border: none;
	}

	.leading-icon {
		display: flex;
		align-items: center;
		padding-left: var(--spacing-2);
	}

	.inline-editor {
		width: 100%;
		border-radius: var(--radius-base);
		font-family: inherit;
		color: var(--text-normal);
		transition: border-color 0.15s ease;
	}

	/* Mode: inline (transparent background) */
	.inline-editor.mode-inline {
		padding: var(--spacing-1) var(--spacing-2);
		border: 1px solid transparent;
		background: transparent;
	}

	.inline-editor.mode-inline:hover:not(:disabled) {
		border-color: var(--border-primary);
	}

	.inline-editor.mode-inline:focus {
		outline: none;
		border-color: var(--border-focus);
		background: var(--surface-base);
	}

	/* Mode: form (always bordered) */
	.inline-editor.mode-form {
		padding: var(--spacing-2);
		border: 1px solid var(--border-primary);
		background: var(--surface-base);
	}

	.inline-editor.mode-form:focus {
		outline: none;
		border-color: var(--border-focus);
	}

	/* Variant: bordered */
	.inline-editor.variant-bordered {
		border: 1px solid var(--border-primary);
	}

	/* Size variants */
	.inline-editor.size-sm {
		font-size: var(--font-size-sm);
		padding: var(--spacing-1);
	}

	.inline-editor.size-md {
		font-size: var(--font-size-base);
	}

	.inline-editor.size-lg {
		font-size: var(--font-size-lg);
		padding: var(--spacing-2) var(--spacing-3);
	}

	.inline-editor.size-xl {
		font-size: var(--font-size-xl);
		padding: var(--spacing-3);
	}

	.inline-editor:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.inline-editor::placeholder {
		color: var(--text-muted);
	}
</style>
