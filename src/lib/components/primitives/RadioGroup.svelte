<!--
@component RadioGroup
A group of radio buttons for selecting one option from a list.

## Props
- `options`: RadioOption[] — list of options with value, label, optional description
- `name`: string — form field name (required)
- `value`: string (bindable) — currently selected value
- `onchange`: callback when selection changes

## Error Handling
This component does NOT have built-in error display. When used in a form context
where validation errors are possible (e.g., "Please select an option"), display
errors at the form level adjacent to this component.

@see documentation/agent-guidelines/error-handling-protocol.md
-->
<script lang="ts">
	import type { RadioOption } from '$lib/schemas/ui/radio';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import CircleNotStarted from '$lib/components/icons/CircleNotStarted.svelte';
	import CircleCheckFill from '$lib/components/icons/CircleCheckFill.svelte';

	// Props
	let {
		options,
		name,
		value = $bindable(),
		onchange = undefined
	} = $props<{
		options: RadioOption[];
		name: string;
		label?: string;
		value: string;
		onchange?: (e: Event) => void;
	}>();

	$effect(() => {
		if (value && onchange) {
			const event = new Event('change', {
				bubbles: true
			});
			onchange(event);
		}
	});
</script>

<div class="radio-group-options">
	{#each options as option}
		<label class="radio-label" class:has-description={!!option.description}>
			<input
				type="radio"
				{name}
				value={option.value}
				bind:group={value}
				class="visually-hidden-radio"
			/>
			<div class="input-wrapper">
				<span class="icon-toggle" data-state={value === option.value ? 'checked' : 'unchecked'}>
					<span class="focus-ring" aria-hidden="true"></span>

					<span class="icon-layer icon-layer--base">
						<Icon color="var(--text-muted)" ariaHidden={true}>
							<CircleNotStarted />
						</Icon>
					</span>

					<span class="icon-layer icon-layer--checked">
						<Icon color="var(--interactive-accent)" ariaHidden={true}>
							<CircleCheckFill />
						</Icon>
					</span>
				</span>
			</div>
			<span class="radio-text">{option.label}</span>
			{#if option.description}
				<span class="radio-description">{option.description}</span>
			{/if}
		</label>
	{/each}
</div>

<style>
	.radio-group-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		background: var(--surface-primary);
		padding: var(--spacing-3);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-primary);
	}
	.radio-label {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: var(--spacing-3);
		row-gap: 2px;
		align-items: flex-start;
		cursor: pointer;
		font-size: var(--font-size-base);
		color: var(--text-normal);
		padding: var(--spacing-2);
		border-radius: var(--radius-lg);
		position: relative;
	}

	/* Visually hide input but keep it accessible */
	.visually-hidden-radio {
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

	.input-wrapper {
		display: flex;
		align-items: center;
		padding-top: 2px; /* Optical alignment with text */
		grid-row: 1;
		align-self: center;
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

	.icon-toggle[data-state='unchecked'] .icon-layer--base {
		opacity: 1;
		transform: scale(1);
	}

	.icon-toggle[data-state='checked'] .icon-layer--checked {
		opacity: 1;
		transform: scale(1);
	}

	/* Focus ring mirrors global :focus-visible styling */
	.focus-ring {
		grid-area: 1 / 1;
		border-radius: var(--radius-full);
		box-shadow: 0 0 0 0 transparent;
		transition: box-shadow var(--transition-duration-100) var(--transition-ease);
		width: 100%;
		height: 100%;
	}

	.visually-hidden-radio:focus-visible + .input-wrapper .focus-ring {
		box-shadow: 0 0 0 2px var(--interactive-accent-muted);
	}

	.radio-text {
		font-weight: 500;
		grid-column: 2;
		grid-row: 1;
		align-self: center;
	}
	.radio-description {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.4;
		grid-column: 2;
		grid-row: 2;
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		.icon-layer,
		.focus-ring {
			transition: none;
		}
	}
</style>
