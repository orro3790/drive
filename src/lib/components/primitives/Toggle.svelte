<!--
@component Toggle
Accessible toggle switch for binary on/off states.

## Props
- `checked`: boolean (bindable) — toggle state
- `disabled`: boolean — disable interaction
- `blocked`: boolean — visually disabled but can trigger onBlocked callback
- `ariaLabel`: string — accessible label
- `onchange`: callback when toggled
- `size`: 'xs' | 'base'
- `variant`: 'accent' | 'warning'

## Error Handling
This component is typically used for settings where the value is persisted immediately.
It does NOT have built-in error display. If the server operation fails, use the toast
system to notify the user. The toggle should revert to its previous state on failure.

@see documentation/agent-guidelines/error-handling-protocol.md
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	/**
	 * Accessible toggle switch
	 * - role="switch" with aria-checked
	 * - keyboard support: Space/Enter toggles
	 * - size uses design tokens
	 */
	let {
		checked = $bindable(false),
		disabled = false,
		blocked = false,
		id = undefined as string | undefined,
		name = undefined as string | undefined,
		ariaLabel = undefined as string | undefined,
		onchange = undefined as ((v: boolean) => void | Promise<void>) | undefined,
		onBlocked = undefined as (() => void | Promise<void>) | undefined,
		size = 'base' as 'xs' | 'base',
		variant = 'accent' as 'accent' | 'warning'
	} = $props<{
		checked?: boolean;
		disabled?: boolean;
		blocked?: boolean;
		id?: string;
		name?: string;
		ariaLabel?: string;
		onchange?: (v: boolean) => void | Promise<void>;
		onBlocked?: () => void | Promise<void>;
		size?: 'xs' | 'base';
		variant?: 'accent' | 'warning';
	}>();

	async function toggle() {
		if (disabled || blocked) {
			if (blocked) {
				await onBlocked?.();
			}
			return;
		}
		checked = !checked;
		await onchange?.(checked);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			void toggle();
		}
	}
</script>

<button
	type="button"
	class="toggle"
	class:disabled={disabled || blocked}
	class:xs={size === 'xs'}
	class:warning={variant === 'warning'}
	role="switch"
	aria-checked={checked}
	aria-disabled={disabled || blocked}
	aria-label={ariaLabel}
	{id}
	{name}
	onclick={toggle}
	onkeydown={onKeydown}
	{disabled}
>
	<span class="knob" aria-hidden="true"></span>
	<span class="sr-only">{checked ? m.common_on() : m.common_off()}</span>
</button>

<style>
	.toggle {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 12px;
		border: var(--border-width-thin) solid var(--border-primary);
		background: var(--interactive-hover);
		cursor: pointer;
		padding: 0;
		outline: none;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}
	.toggle.xs {
		width: 20px;
		height: 12px;
	}
	.toggle[aria-checked='true'] {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
	}
	.toggle.warning[aria-checked='true'] {
		background: var(--status-warning);
		border-color: var(--status-warning);
	}
	.toggle.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: var(--radius-full);
		background: var(--color-white);
		box-shadow: var(--shadow-base);
		transform: translateX(0);
		transition: transform 120ms ease;
	}
	.toggle.xs .knob {
		width: 6px;
		height: 6px;
		top: 2px;
		left: 2px;
	}
	.toggle[aria-checked='true'] .knob {
		transform: translateX(16px);
	}
	.toggle.xs[aria-checked='true'] .knob {
		transform: translateX(8px);
	}
	.toggle:disabled,
	.toggle.disabled {
		background: var(--interactive-hover);
		border-color: var(--border-primary);
		opacity: 0.5;
		cursor: default;
	}
	.toggle:disabled .knob,
	.toggle.disabled .knob {
		background: var(--text-muted);
	}

	@media (pointer: coarse), (hover: none) {
		.toggle::before {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			width: 44px;
			height: 44px;
			transform: translate(-50%, -50%);
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
