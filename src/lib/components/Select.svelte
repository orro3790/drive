<!--
@component Select
A simple dropdown for static option lists. No filtering, no async.

## Error Handling
This component has BUILT-IN inline error display. Pass `errors` prop (string[]) and
errors will display persistently below the select with a slide-down animation.
The select border turns red when errors are present.

```svelte
<Select
  options={countryOptions}
  bind:value={country}
  errors={countryErrors}
/>
```

@see documentation/agent-guidelines/error-handling-protocol.md
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount, tick } from 'svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import type { SelectOption } from '$lib/schemas/ui/select';
	import { createErrorDisplay, DEFAULT_MAX_ERRORS } from '$lib/utils/errorDisplay';
	import { debounce } from '$lib/stores/helpers/debounce';
	import type { Snippet } from 'svelte';

	let {
		options,
		value = $bindable<string | number | undefined>(),
		placeholder,
		id: idProp,
		name,
		disabled = false,
		'aria-label': ariaLabel,
		errors = [],
		maxErrors = DEFAULT_MAX_ERRORS,
		size = 'base' as 'base' | 'sm' | 'small' | 'xs' | 'xl',
		fitContent = false,
		renderTrigger = undefined,
		renderOption = undefined,
		onChange = undefined,
		onSelect = undefined
	}: {
		options: SelectOption[];
		value?: string | number;
		placeholder?: string;
		id?: string;
		name?: string;
		disabled?: boolean;
		'aria-label'?: string;
		errors?: string[];
		maxErrors?: number;
		size?: 'base' | 'sm' | 'small' | 'xs' | 'xl';
		fitContent?: boolean;
		renderTrigger?: Snippet<[SelectOption | undefined]>;
		renderOption?: Snippet<[SelectOption]>;
		onChange?: (value: string | number) => void;
		onSelect?: (option: SelectOption) => void;
	} = $props();

	const displayPlaceholder = $derived(placeholder ?? m.select_placeholder());
	const normalizedSize = $derived(size === 'small' ? 'sm' : size);

	let isOpen = $state(false);
	let id = $state<string | undefined>(undefined);
	let selectElement: HTMLDivElement | null = $state(null);
	let triggerElement: HTMLButtonElement | null = $state(null);
	let optionsListElement: HTMLUListElement | null = $state(null);
	let activeIndex = $state<number>(-1);
	let dropdownPanelElement: HTMLDivElement | null = $state(null);
	let dropdownStyle = $state('');

	const selectedOption = $derived(options.find((option) => option.value === value));
	const selectedLabel = $derived(selectedOption?.label || displayPlaceholder);
	const listboxId = $derived(id ? `${id}-listbox` : '');
	const errorDisplay = $derived(createErrorDisplay(errors, maxErrors));

	onMount(() => {
		id = idProp || `select-${window.crypto.randomUUID()}`;
		document.addEventListener('click', handleClickOutside, true);
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
		};
	});

	function toggleDropdown() {
		if (disabled) return;
		isOpen = !isOpen;
		if (isOpen) {
			const selectedIdx = options.findIndex((o) => o.value === value);
			activeIndex = selectedIdx >= 0 ? selectedIdx : 0;
		}
	}

	function handleOptionClick(optionValue: string | number) {
		value = optionValue;
		isOpen = false;
		if (onChange) {
			onChange(optionValue);
		}
		if (onSelect) {
			const opt = options.find((o) => o.value === optionValue);
			if (opt) onSelect(opt);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) return;
		switch (event.key) {
			case 'Enter':
			case ' ':
				toggleDropdown();
				event.preventDefault();
				break;
			case 'Escape':
				isOpen = false;
				break;
		}
	}

	function focusActiveOption() {
		const items = optionsListElement?.querySelectorAll('.option-item');
		if (!items || items.length === 0) return;
		const idx = Math.max(0, Math.min(activeIndex, items.length - 1));
		const el = items[idx] as HTMLLIElement;
		el.focus({
			preventScroll: true
		});
		el.scrollIntoView({
			block: 'nearest'
		});
	}

	function setActive(index: number) {
		if (!options || options.length === 0) return;
		activeIndex = Math.max(0, Math.min(index, options.length - 1));
		focusActiveOption();
	}

	function moveActive(delta: number) {
		if (!options || options.length === 0) return;
		setActive(activeIndex + delta);
	}

	function handleOptionKeydown(event: KeyboardEvent, index: number) {
		if (disabled) return;
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = index;
				moveActive(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = index;
				moveActive(-1);
				break;
			case 'Home':
				event.preventDefault();
				setActive(0);
				break;
			case 'End':
				event.preventDefault();
				setActive(options.length - 1);
				break;
			case 'Enter':
			case ' ': {
				event.preventDefault();
				const opt = options[index];
				if (opt) handleOptionClick(opt.value);
				break;
			}
			case 'Escape':
				isOpen = false;
				triggerElement?.focus();
				break;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (selectElement && !selectElement.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	function updateDropdownPosition() {
		if (!triggerElement || !dropdownPanelElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const dropdownRect = dropdownPanelElement.getBoundingClientRect();
		const dropdownWidth = dropdownRect.width;
		const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

		// Calculate horizontal position
		let left = triggerRect.left;
		const wouldEndAt = left + dropdownWidth;

		if (wouldEndAt > viewportWidth - 8) {
			// Align to right edge of trigger
			left = triggerRect.right - dropdownWidth;
		}

		// Calculate vertical position - check if there's room below
		const spaceBelow = viewportHeight - triggerRect.bottom - 8;
		const spaceAbove = triggerRect.top - 8;
		const dropdownHeight = Math.min(dropdownRect.height, 280);

		let top: number;
		if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
			// Position below
			top = triggerRect.bottom + 4;
		} else {
			// Position above
			top = triggerRect.top - dropdownHeight - 4;
		}

		dropdownStyle = `top: ${top}px; left: ${left}px; min-width: ${triggerRect.width}px;`;
	}

	$effect(() => {
		if (!isOpen || !dropdownPanelElement) return;

		tick().then(() => {
			if (!dropdownPanelElement) return;
			updateDropdownPosition();
			focusActiveOption();
		});

		const onResize = debounce(() => updateDropdownPosition(), 100);
		const onScroll = debounce(() => updateDropdownPosition(), 50);
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onScroll, true);
		};
	});

	$effect(() => {
		if (isOpen) {
			const idx = options.findIndex((o) => o.value === value);
			activeIndex = idx >= 0 ? idx : 0;
		}
	});
</script>

<div class="select-wrapper">
	<div
		class="select-container"
		class:has-errors={errorDisplay.hasErrors}
		class:fit-content={fitContent}
		class:size-sm={normalizedSize === 'sm'}
		class:size-xs={normalizedSize === 'xs'}
		class:size-xl={normalizedSize === 'xl'}
		bind:this={selectElement}
		role="presentation"
	>
		<button
			bind:this={triggerElement}
			type="button"
			class="select-trigger"
			{id}
			onclick={toggleDropdown}
			onkeydown={handleKeydown}
			{disabled}
			aria-haspopup="listbox"
			aria-expanded={isOpen}
			aria-label={ariaLabel || selectedLabel}
			aria-describedby={errorDisplay.hasErrors ? `${id}-errors` : undefined}
		>
			<div class="trigger-content">
				{#if renderTrigger}
					{@render renderTrigger(selectedOption)}
				{:else}
					{#if selectedOption?.iconSrc}
						<img
							src={selectedOption.iconSrc}
							alt={selectedOption.iconAlt || ''}
							class="option-icon"
						/>
					{/if}
					<span class="select-label">{selectedLabel}</span>
				{/if}
			</div>
			<div class="chevron-wrapper" class:open={isOpen}>
				<Icon>
					<ChevronDown />
				</Icon>
			</div>
		</button>

		{#if isOpen}
			<div
				class="dropdown-panel"
				class:auto-size={fitContent}
				style={dropdownStyle}
				bind:this={dropdownPanelElement}
			>
				<ul
					class="options-list"
					role="listbox"
					id={listboxId || undefined}
					bind:this={optionsListElement}
				>
					{#if options.length === 0}
						<li
							class="option-item empty"
							role="option"
							aria-disabled="true"
							aria-selected="false"
							tabindex="-1"
						>
							<span class="option-text text-muted">{m.select_no_results()}</span>
						</li>
					{:else}
						{#each options as option, index (option.value)}
							<li
								class="option-item"
								class:selected={value === option.value}
								role="option"
								aria-selected={value === option.value}
								onclick={() => handleOptionClick(option.value)}
								onkeydown={(e) => handleOptionKeydown(e, index)}
								tabindex={index === activeIndex ? 0 : -1}
							>
								{#if renderOption}
									{@render renderOption(option)}
								{:else}
									{#if option.iconSrc}
										<img src={option.iconSrc} alt={option.iconAlt || ''} class="option-icon" />
									{/if}
									<span class="option-text">{option.label}</span>
								{/if}
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		{/if}

		{#if name}
			<input type="hidden" {name} value={value ?? ''} />
		{/if}
	</div>
	{#if errorDisplay.hasErrors}
		<div class="inline-errors" id="{id}-errors" role="alert" aria-live="polite">
			{#each errorDisplay.displayErrors as error (error)}
				<span class="inline-error">{error}</span>
			{/each}
			{#if errorDisplay.showMoreCount > 0}
				<span class="inline-error"
					>{m.select_errors_more({ count: errorDisplay.showMoreCount })}</span
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.select-wrapper {
		display: flex;
		flex-direction: column;
	}

	.select-container {
		position: relative;
		width: 100%;
		height: 36px;
	}

	.select-container.size-sm {
		height: 28px;
	}

	.select-container.size-xs {
		height: 22px;
	}

	.select-container.size-xl {
		height: 54px;
	}

	.select-container.size-xs .select-trigger {
		font-size: var(--font-size-sm);
		padding: 0 var(--spacing-1) 0 var(--spacing-1-5);
	}

	.select-container.size-xs .select-label {
		font-size: var(--font-size-sm);
	}

	.select-container.size-xs .option-item {
		height: 22px;
		font-size: var(--font-size-sm);
		padding: 0 var(--spacing-1-5);
	}

	.select-container.size-xl .select-trigger {
		font-size: var(--font-size-base);
	}

	.select-container.size-xl .option-item {
		height: 54px;
		font-size: var(--font-size-base);
	}

	.select-container.size-xl .option-icon {
		width: 38px;
		height: 38px;
	}

	.select-container.fit-content {
		width: max-content;
	}

	.select-container.fit-content .select-trigger {
		width: max-content;
	}

	.select-container.fit-content .trigger-content {
		flex: 0 1 auto;
	}

	.select-trigger {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		justify-content: space-between;
		width: 100%;
		height: 100%;
		padding: 0 var(--spacing-1) 0 var(--spacing-2);
		background: var(--surface-primary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		color: var(--text-normal);
		font-size: var(--font-size-base);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--transition-duration-200) ease;
		box-sizing: border-box;
	}

	.select-trigger:hover:not(:disabled):not([aria-expanded='true']) {
		border-color: var(--interactive-hover);
	}

	.select-trigger:focus,
	.select-trigger:focus-visible {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.select-trigger[disabled] {
		opacity: 0.5;
	}

	.select-container.has-errors .select-trigger {
		border-color: var(--status-error);
	}

	.select-container.has-errors .select-trigger:focus,
	.select-container.has-errors .select-trigger:focus-visible {
		border-color: var(--status-error);
		box-shadow: 0 0 0 1px var(--status-error);
	}

	.trigger-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		flex: 1;
		overflow: hidden;
	}

	.select-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--font-size-base);
		color: var(--text-normal);
	}

	.dropdown-panel {
		position: fixed;
		z-index: var(--z-dropdown);
		background: var(--surface-primary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-base);
		padding: var(--spacing-1);
		max-height: 280px;
		overflow-y: auto;
	}

	.dropdown-panel.auto-size {
		width: max-content;
	}

	.options-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.option-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		height: 28px;
		padding: 0 var(--spacing-2);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: background-color var(--transition-duration-200) ease;
		color: var(--text-normal);
		font-size: var(--font-size-base);
	}

	.option-item:hover {
		background-color: var(--interactive-hover);
	}

	.option-item.selected {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.option-item.empty {
		cursor: default;
		color: var(--text-muted);
	}

	.option-item.empty:hover {
		background-color: transparent;
	}

	.option-icon {
		width: 16px;
		height: 16px;
		object-fit: contain;
		flex-shrink: 0;
	}

	.option-text {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chevron-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform var(--transition-duration-200) ease;
		color: var(--text-muted);
	}

	.chevron-wrapper.open {
		transform: rotate(180deg);
	}

	.inline-errors {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		padding-top: var(--spacing-1);
		animation: slideDown 0.2s ease-out;
	}

	.inline-error {
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (pointer: coarse), (hover: none) {
		.select-container:not(.size-xl) {
			height: 44px;
			min-height: 44px;
		}

		.select-container .option-item {
			height: auto;
			min-height: 44px;
		}
	}
</style>
