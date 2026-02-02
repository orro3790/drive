<!--
@component Textarea
A multi-line text input with consistent styling.

## Props
- `value`: string (bindable) - textarea content
- `placeholder`: string - placeholder text
- `disabled`: boolean - disable interaction
- `rows`: number - initial row height (default: 3)
- `id`/`name`: string - form field attributes
- `mode`: 'inline' | 'form' - visual mode
- `resize`: 'none' | 'vertical' | 'horizontal' | 'both' - resize behavior

## Error Handling
Pass `error` as a boolean to show error styling.
Error message display is handled by parent form component.
-->
<script lang="ts">
	type TextareaMode = 'inline' | 'form';
	type TextareaResize = 'none' | 'vertical' | 'horizontal' | 'both';

	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 3,
		id,
		name,
		mode = 'form',
		resize = 'vertical',
		error = false,
		ariaLabel,
		onInput,
		onBlur,
		onSave
	} = $props<{
		value?: string | null;
		placeholder?: string;
		disabled?: boolean;
		rows?: number;
		id?: string;
		name?: string;
		mode?: TextareaMode;
		resize?: TextareaResize;
		error?: boolean;
		ariaLabel?: string;
		onInput?: (value: string) => void;
		onBlur?: () => void;
		onSave?: (value: string) => void;
	}>();

	let textareaElement = $state<HTMLTextAreaElement | null>(null);

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		value = target.value;
		onInput?.(target.value);
	}

	function handleBlur() {
		onSave?.(value ?? '');
		onBlur?.();
	}

	export function focus() {
		textareaElement?.focus();
	}

	export function blur() {
		textareaElement?.blur();
	}
</script>

<textarea
	bind:this={textareaElement}
	{id}
	{name}
	class="textarea mode-{mode} resize-{resize}"
	class:error
	{placeholder}
	{disabled}
	{rows}
	aria-label={ariaLabel}
	value={value ?? ''}
	oninput={handleInput}
	onblur={handleBlur}
></textarea>

<style>
	.textarea {
		width: 100%;
		border-radius: var(--radius-base);
		font-family: inherit;
		font-size: var(--font-size-base);
		color: var(--text-normal);
		min-height: 60px;
		transition: border-color var(--transition-duration-100) var(--transition-ease);
	}

	/* Mode: inline (transparent background) */
	.textarea.mode-inline {
		padding: var(--spacing-1) var(--spacing-2);
		border: 1px solid transparent;
		background: transparent;
	}

	.textarea.mode-inline:hover:not(:disabled) {
		border-color: var(--border-primary);
	}

	.textarea.mode-inline:focus {
		outline: none;
		border-color: var(--interactive-accent);
		background: var(--surface-base);
	}

	/* Mode: form (always bordered) */
	.textarea.mode-form {
		padding: var(--spacing-2);
		border: 1px solid var(--border-primary);
		background: var(--surface-primary);
	}

	.textarea.mode-form:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	/* Error state */
	.textarea.error {
		border-color: var(--status-error);
	}

	/* Resize variants */
	.textarea.resize-none {
		resize: none;
	}

	.textarea.resize-vertical {
		resize: vertical;
	}

	.textarea.resize-horizontal {
		resize: horizontal;
	}

	.textarea.resize-both {
		resize: both;
	}

	.textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.textarea::placeholder {
		color: var(--text-muted);
	}
</style>
