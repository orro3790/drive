<!--
@component Checkbox
A checkbox input with animated icon states.

## Props
- `checked`: boolean (bindable) — checkbox state
- `indeterminate`: boolean — show indeterminate state
- `disabled`: boolean — disable interaction
- `label`: string — accessible label text
- `name`/`id`: string — form field attributes

## Error Handling
This component does NOT have built-in error display. When used in a form context
where validation errors are possible (e.g., "You must agree to terms"), display
errors at the form level adjacent to this component. For server/API errors during
save operations, use the toast system.

@see documentation/agent-guidelines/error-handling-protocol.md
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import CheckboxChecked from '$lib/components/icons/CheckboxChecked.svelte';
	import CheckboxUnchecked from '../icons/CheckboxUnchecked.svelte';

	let {
		checked = $bindable(false),
		indeterminate = false,
		disabled = false,
		label = '',
		ariaLabel = '',
		name = '',
		id = `checkbox-${
			typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
				? crypto.randomUUID()
				: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
		}`,
		children = undefined,
		onclick = undefined,
		onchange = undefined
	} = $props<{
		checked?: boolean;
		indeterminate?: boolean;
		disabled?: boolean;
		label?: string;
		ariaLabel?: string;
		name?: string;
		id?: string;
		children?: Snippet;
		onclick?: (event: MouseEvent) => void;
		onchange?: (event: Event) => void;
	}>();

	let inputEl: HTMLInputElement | null = null;

	$effect(() => {
		if (inputEl) {
			inputEl.indeterminate = !!indeterminate;
		}
	});
</script>

<label class="checkbox-container" class:disabled>
	<input
		type="checkbox"
		{id}
		{name}
		bind:this={inputEl}
		{checked}
		{disabled}
		onclick={(e: MouseEvent) => {
			checked = (e.currentTarget as HTMLInputElement).checked;
			if (onclick) onclick(e);
		}}
		onchange={(e) => {
			if (onchange) onchange(e);
		}}
		class="visually-hidden-checkbox"
		aria-label={ariaLabel || label || undefined}
		aria-describedby={label ? `${id}-label` : undefined}
	/>

	<span
		class="icon-toggle"
		data-state={indeterminate ? 'mixed' : checked ? 'checked' : 'unchecked'}
	>
		<span class="focus-ring" aria-hidden="true"></span>

		<span class="icon-layer icon-layer--base">
			<Icon color="var(--text-muted)">
				<CheckboxUnchecked />
			</Icon>
		</span>

		<span class="icon-layer icon-layer--checked">
			<Icon color="var(--interactive-accent)">
				<CheckboxChecked />
			</Icon>
		</span>

		<span class="indeterminate-bar" aria-hidden="true"></span>
	</span>

	{#if label}
		<span id={`${id}-label`} class="checkbox-label">{label}</span>
	{/if}

	{@render children?.()}
</label>

<style>
	.checkbox-container {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-2);
		cursor: pointer;
		position: relative;
	}

	.checkbox-container.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Visually hide input but keep it accessible and focusable */
	.visually-hidden-checkbox {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
		padding: 0;
		border: 0;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		overflow: hidden;
	}

	.icon-toggle {
		display: inline-grid;
		position: relative;
		place-items: center;
	}

	.icon-layer {
		grid-area: 1 / 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transform: scale(0.7);
		transition:
			opacity var(--transition-duration-200) var(--transition-ease),
			transform var(--transition-duration-200) var(--transition-ease);
	}

	.icon-layer--checked {
		transform: scale(0.7);
	}

	.icon-toggle[data-state='unchecked'] .icon-layer--base,
	.icon-toggle[data-state='mixed'] .icon-layer--base {
		opacity: 1;
		transform: scale(1);
	}

	.icon-toggle[data-state='checked'] .icon-layer--checked {
		opacity: 1;
		transform: scale(1);
	}

	.indeterminate-bar {
		grid-area: 1 / 1;
		width: 60%;
		height: 2px;
		background-color: var(--interactive-accent);
		border-radius: var(--radius-full);
		opacity: 0;
		transition: opacity var(--transition-duration-200) var(--transition-ease);
	}

	.icon-toggle[data-state='mixed'] .indeterminate-bar {
		opacity: 1;
	}

	/* Focus ring mirrors global :focus-visible styling */
	.focus-ring {
		grid-area: 1 / 1;
		border-radius: var(--radius-sm);
		box-shadow: 0 0 0 0 transparent;
		transition: box-shadow var(--transition-duration-100) var(--transition-ease);
	}

	.visually-hidden-checkbox:focus-visible + .icon-toggle .focus-ring {
		box-shadow: 0 0 0 2px var(--interactive-accent-muted);
	}

	.checkbox-label {
		font-size: var(--font-size-base);
		color: var(--text-normal);
	}

	@media (pointer: coarse), (hover: none) {
		.checkbox-container {
			min-width: 44px;
			min-height: 44px;
		}

		.icon-toggle {
			min-width: 44px;
			min-height: 44px;
		}
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		.indeterminate-bar,
		.focus-ring {
			transition: none;
		}
	}
</style>
