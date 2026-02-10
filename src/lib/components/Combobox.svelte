<!--
@component Combobox
Filterable select with search-as-you-type. Supports both static and async data.

## Error Handling
This component has BUILT-IN inline error display. Pass `errors` prop (string[]) and
errors will display persistently below the combobox with a slide-down animation.
The combobox border turns red when errors are present.

```svelte
<Combobox
  options={studentOptions}
  bind:value={studentId}
  errors={studentErrors}
/>
```

@see documentation/agent-guidelines/error-handling-protocol.md
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount, onDestroy, tick } from 'svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import type { SelectOption } from '$lib/schemas/ui/select';
	import { createErrorDisplay, DEFAULT_MAX_ERRORS } from '$lib/utils/errorDisplay';
	import { debounce } from '$lib/stores/helpers/debounce';
	import type { Snippet } from 'svelte';

	let {
		options,
		dataSource = undefined as
			| undefined
			| {
					fetchPage: (args: {
						query?: string;
						cursor?: unknown;
						limit?: number;
						signal?: AbortSignal;
					}) => Promise<{ options: SelectOption[]; cursor?: unknown; hasMore: boolean }>;
					fetchById?: (value: string | number) => Promise<SelectOption | null>;
			  },
		value = $bindable<string | number | undefined>(),
		placeholder,
		searchPlaceholder,
		id: idProp,
		name,
		disabled = false,
		'aria-label': ariaLabel,
		errors = [],
		maxErrors = DEFAULT_MAX_ERRORS,
		size = 'base' as 'base' | 'sm' | 'small' | 'xs' | 'xl',
		fitContent = false,
		pageSize = 25,
		searchDebounceMs = 300,
		loading = false,
		renderTrigger = undefined,
		renderOption = undefined,
		onChange = undefined,
		onSelect = undefined
	}: {
		options?: SelectOption[];
		dataSource?: {
			fetchPage: (args: {
				query?: string;
				cursor?: unknown;
				limit?: number;
				signal?: AbortSignal;
			}) => Promise<{ options: SelectOption[]; cursor?: unknown; hasMore: boolean }>;
			fetchById?: (value: string | number) => Promise<SelectOption | null>;
		};
		value?: string | number;
		placeholder?: string;
		searchPlaceholder?: string;
		id?: string;
		name?: string;
		disabled?: boolean;
		'aria-label'?: string;
		errors?: string[];
		maxErrors?: number;
		size?: 'base' | 'sm' | 'small' | 'xs' | 'xl';
		fitContent?: boolean;
		pageSize?: number;
		searchDebounceMs?: number;
		loading?: boolean;
		renderTrigger?: Snippet<[SelectOption | undefined]>;
		renderOption?: Snippet<[SelectOption]>;
		onChange?: (value: string | number) => void;
		onSelect?: (option: SelectOption) => void;
	} = $props();

	const displayPlaceholder = $derived(placeholder ?? m.select_placeholder());
	const displaySearchPlaceholder = $derived(searchPlaceholder ?? m.select_search_placeholder());
	const normalizedSize = $derived(size === 'small' ? 'sm' : size);

	let isOpen = $state(false);
	let id = $state<string | undefined>(undefined);
	let selectElement: HTMLDivElement | null = $state(null);
	let triggerElement: HTMLButtonElement | null = $state(null);
	let query = $state('');
	let searchElement: HTMLInputElement | null = $state(null);
	let optionsListElement: HTMLUListElement | null = $state(null);
	let activeIndex = $state<number>(-1);
	let dropdownPanelElement: HTMLDivElement | null = $state(null);
	let alignRight = $state(false);

	const staticOptions = $derived(options ?? []);

	// Async-driven options state
	let dsItems = $state<SelectOption[]>([]);
	let dsCursor = $state<unknown>(undefined);
	let dsHasMore = $state(false);
	let isFetching = $state(false);
	let fetchSeq = 0;
	let activeFetchAbort: AbortController | null = null;
	let hasFetchedOnce = $state(false);
	let lastSearchQuery = $state('');

	const sourceOptions = $derived(dataSource ? dsItems : staticOptions);
	const selectedOption = $derived(sourceOptions.find((option) => option.value === value));
	const selectedLabel = $derived(selectedOption?.label || displayPlaceholder);
	const listboxId = $derived(id ? `${id}-listbox` : '');

	let isHydratingSelected = $state(false);
	const isBusy = $derived(
		Boolean(loading) || (Boolean(dataSource) && (isFetching || isHydratingSelected))
	);

	const shouldShowDropdown = $derived.by(() => {
		if (!isOpen) return false;
		if (dataSource) {
			return isFetching || hasFetchedOnce;
		}
		return true;
	});

	const errorDisplay = $derived(createErrorDisplay(errors, maxErrors));

	onMount(() => {
		id = idProp || `combobox-${window.crypto.randomUUID()}`;
		document.addEventListener('click', handleClickOutside, true);
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
		};
	});

	onDestroy(() => {
		try {
			activeFetchAbort?.abort();
		} catch {
			/* noop */
		}
	});

	function toggleDropdown() {
		if (disabled) return;
		isOpen = !isOpen;
		if (isOpen) {
			const selectedIdx = filteredOptions.findIndex((o) => o.value === value);
			activeIndex = selectedIdx >= 0 ? selectedIdx : 0;
		}
	}

	function handleOptionClick(optionValue: string | number) {
		value = optionValue;
		const opt = sourceOptions.find((o) => o.value === optionValue);
		if (opt) {
			query = opt.label;
		}
		isOpen = false;
		if (onChange) {
			onChange(optionValue);
		}
		if (onSelect && opt) {
			onSelect(opt);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) return;
		switch (event.key) {
			case 'Enter':
			case ' ':
				if (!isOpen) {
					toggleDropdown();
					event.preventDefault();
				}
				break;
			case 'Escape':
				isOpen = false;
				break;
			case 'ArrowDown': {
				event.preventDefault();
				if (!isOpen) {
					isOpen = true;
				}
				const selectedIdx = filteredOptions.findIndex((o) => o.value === value);
				activeIndex = selectedIdx >= 0 ? selectedIdx : 0;
				tick().then(() => {
					focusSearchInput();
				});
				break;
			}
		}
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (disabled) return;
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (!isOpen) {
					isOpen = true;
				}
				activeIndex = Math.max(0, Math.min(activeIndex, filteredOptions.length - 1));
				tick().then(() => {
					focusActiveOption();
				});
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (activeIndex > 0) {
					activeIndex--;
					focusActiveOption();
				}
				break;
			case 'Escape':
				if (isOpen) {
					event.preventDefault();
					isOpen = false;
					triggerElement?.focus();
				}
				break;
			case 'Enter': {
				if (isOpen && activeIndex >= 0) {
					const opt = filteredOptions[activeIndex];
					if (opt) {
						event.preventDefault();
						handleOptionClick(opt.value);
					}
				}
				break;
			}
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

	function focusSearchInput() {
		if (searchElement) {
			searchElement.focus();
		}
	}

	function setActive(index: number) {
		if (!filteredOptions || filteredOptions.length === 0) return;
		activeIndex = Math.max(0, Math.min(index, filteredOptions.length - 1));
		focusActiveOption();
	}

	function moveActive(delta: number) {
		if (!filteredOptions || filteredOptions.length === 0) return;
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
				setActive(filteredOptions.length - 1);
				break;
			case 'Enter':
			case ' ': {
				event.preventDefault();
				const opt = filteredOptions[index];
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
			// Revert to selected label if query doesn't match
			const trimmedQuery = query.trim();
			const matchesOption = sourceOptions.some(
				(opt) => opt.label.toLowerCase() === trimmedQuery.toLowerCase()
			);
			if (!matchesOption) {
				query = selectedOption?.label ?? '';
			}
		}
	}

	function updateDropdownAlignment() {
		if (!dropdownPanelElement) return;

		const container = dropdownPanelElement.closest('.combobox-container');
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		const dropdownRect = dropdownPanelElement.getBoundingClientRect();
		const dropdownWidth = dropdownRect.width;

		const wouldEndAt = containerRect.left + dropdownWidth;

		const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
		if (wouldEndAt > viewportWidth - 8) {
			alignRight = true;
			return;
		}

		let parent = dropdownPanelElement.parentElement;
		while (parent && parent !== document.body) {
			const styles = window.getComputedStyle(parent);
			const hasOverflow = styles.overflowX !== 'visible' || styles.overflowY !== 'visible';

			if (hasOverflow) {
				const parentRect = parent.getBoundingClientRect();
				const visibleRight = parentRect.left + parent.clientWidth;
				if (wouldEndAt > visibleRight - 8) {
					alignRight = true;
					return;
				}
			}
			parent = parent.parentElement;
		}

		alignRight = false;
	}

	$effect(() => {
		if (!isOpen || !dropdownPanelElement) return;

		tick().then(() => {
			if (!dropdownPanelElement) return;
			updateDropdownAlignment();
			focusSearchInput();
		});

		const onResize = debounce(() => updateDropdownAlignment(), 100);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
		};
	});

	const filteredOptions = $derived.by(() => {
		if (dataSource) return sourceOptions;
		if (!query.trim()) {
			return sourceOptions;
		}
		const needle = query.trim().toLowerCase();
		return sourceOptions.filter((o) => o.label.toLowerCase().includes(needle));
	});

	$effect(() => {
		if (isOpen) {
			const idx = filteredOptions.findIndex((o) => o.value === value);
			activeIndex = idx >= 0 ? idx : 0;
		}
	});

	async function fetchNextPage(currentQuery: string, reset = false) {
		if (!dataSource || isFetching) return;
		isFetching = true;
		const seq = ++fetchSeq;
		try {
			activeFetchAbort?.abort();
		} catch {
			/* noop */
		}
		activeFetchAbort = new AbortController();
		try {
			const res = await dataSource.fetchPage({
				query: currentQuery,
				cursor: reset ? undefined : dsCursor,
				limit: pageSize,
				signal: activeFetchAbort.signal
			});
			if (seq !== fetchSeq) return;
			if (reset) {
				dsItems = res.options ?? [];
			} else {
				const seen = new Set(dsItems.map((o) => o.value));
				const appended = (res.options ?? []).filter((o) => !seen.has(o.value));
				dsItems = [...dsItems, ...appended];
			}
			dsCursor = res.cursor;
			dsHasMore = !!res.hasMore;
			hasFetchedOnce = true;
		} catch {
			hasFetchedOnce = true;
		} finally {
			isFetching = false;
		}
	}

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!dataSource) return;
		if (!isOpen) return;
		const q = query.trim();
		if (searchTimer) clearTimeout(searchTimer);
		if (q !== lastSearchQuery) {
			dsItems = [];
			hasFetchedOnce = false;
		}
		searchTimer = setTimeout(
			() => {
				lastSearchQuery = q;
				void fetchNextPage(q, true);
			},
			Math.max(0, searchDebounceMs)
		);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	let hydratedValue: string | number | undefined = undefined;
	$effect(() => {
		if (!dataSource || !dataSource.fetchById) return;
		if (value === undefined || value === null || value === '') return;
		if (hydratedValue === value) return;

		const exists = sourceOptions.some((o) => o.value === value);
		if (!exists) {
			hydratedValue = value;
			isHydratingSelected = true;
			void dataSource
				.fetchById(value)
				.then((opt) => {
					if (opt && hydratedValue === value) {
						const existsNow = dsItems.some((o) => o.value === opt.value);
						if (!existsNow) {
							dsItems = [opt, ...dsItems];
						}
						query = opt.label;
					}
				})
				.catch(() => {
					if (hydratedValue === value) {
						value = undefined;
					}
				})
				.finally(() => {
					isHydratingSelected = false;
				});
		} else {
			hydratedValue = value;
			if (selectedOption) {
				query = selectedOption.label;
			}
		}
	});

	function handleListScroll() {
		if (!dataSource || !optionsListElement) return;
		if (!dsHasMore || isFetching) return;
		const el = optionsListElement;
		const threshold = 40;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
			void fetchNextPage(query.trim(), false);
		}
	}

	const ariaLiveMessage = $derived.by(() => {
		if (!dataSource || !isOpen) return '';
		if (isFetching) return m.select_loading_results();
		if (!dsHasMore) return m.select_no_more_results();
		return '';
	});
</script>

<div class="combobox-wrapper">
	<div
		class="combobox-container"
		class:has-errors={errorDisplay.hasErrors}
		class:fit-content={fitContent}
		class:size-sm={normalizedSize === 'sm'}
		class:size-xs={normalizedSize === 'xs'}
		class:size-xl={normalizedSize === 'xl'}
		bind:this={selectElement}
		role="presentation"
		aria-busy={isBusy ? 'true' : 'false'}
	>
		<button
			bind:this={triggerElement}
			type="button"
			class="combobox-trigger"
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
					<span class="trigger-label">{selectedLabel}</span>
				{/if}
			</div>
			<div class="chevron-wrapper" class:open={isOpen}>
				<Icon>
					<ChevronDown />
				</Icon>
			</div>
		</button>

		{#if shouldShowDropdown}
			<div
				class="dropdown-panel"
				class:auto-size={fitContent}
				class:align-right={alignRight}
				bind:this={dropdownPanelElement}
			>
				<input
					class="search-input"
					type="text"
					placeholder={displaySearchPlaceholder}
					bind:value={query}
					bind:this={searchElement}
					role="searchbox"
					autocomplete="off"
					spellcheck="false"
					autocapitalize="off"
					autocorrect="off"
					onkeydown={handleSearchKeydown}
					oninput={() => {
						if (!isOpen) isOpen = true;
						if (query.trim() === '' && !dataSource) {
							value = undefined;
						}
					}}
				/>
				<ul
					class="options-list"
					role="listbox"
					id={listboxId || undefined}
					bind:this={optionsListElement}
					aria-busy={dataSource ? (isFetching ? 'true' : 'false') : undefined}
					onscroll={handleListScroll}
				>
					{#if dataSource && isFetching && filteredOptions.length === 0}
						<div class="loading-container">
							<Spinner size={16} label={m.select_loading_options()} />
						</div>
					{:else if filteredOptions.length === 0}
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
						{#each filteredOptions as option, index (option.value)}
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
						{#if dataSource && isFetching}
							<div class="loading-container">
								<Spinner size={16} label={m.select_loading_results()} />
							</div>
						{/if}
					{/if}
				</ul>
				{#if dataSource}
					<div class="sr-only" aria-live="polite">{ariaLiveMessage}</div>
				{/if}
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
	.combobox-wrapper {
		display: flex;
		flex-direction: column;
	}

	.combobox-container {
		position: relative;
		width: 100%;
		height: 36px;
	}

	.combobox-container.size-sm {
		height: 28px;
	}

	.combobox-container.size-xs {
		height: 22px;
	}

	.combobox-container.size-xl {
		height: 54px;
	}

	.combobox-container.size-xs .combobox-trigger {
		font-size: var(--font-size-sm);
		padding: 0 var(--spacing-1) 0 var(--spacing-1-5);
	}

	.combobox-container.size-xs .trigger-label {
		font-size: var(--font-size-sm);
	}

	.combobox-container.size-xs .option-item {
		height: 22px;
		font-size: var(--font-size-sm);
		padding: 0 var(--spacing-1-5);
	}

	.combobox-container.size-xs .search-input {
		font-size: var(--font-size-sm);
		padding: var(--spacing-1) var(--spacing-1-5);
	}

	.combobox-container.size-xl .combobox-trigger {
		font-size: var(--font-size-base);
	}

	.combobox-container.size-xl .option-item {
		height: 54px;
		font-size: var(--font-size-base);
	}

	.combobox-container.size-xl .option-icon {
		width: 38px;
		height: 38px;
		border-radius: var(--radius-full);
	}

	.combobox-container.fit-content {
		width: max-content;
	}

	.combobox-container.fit-content .combobox-trigger {
		width: max-content;
	}

	.combobox-container.fit-content .trigger-content {
		flex: 0 1 auto;
	}

	.combobox-trigger {
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

	.combobox-trigger:hover:not(:disabled):not([aria-expanded='true']) {
		border-color: var(--interactive-hover);
	}

	.combobox-trigger:focus,
	.combobox-trigger:focus-visible {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.combobox-trigger[disabled] {
		opacity: 0.5;
	}

	.combobox-container.has-errors .combobox-trigger {
		border-color: var(--status-error);
	}

	.combobox-container.has-errors .combobox-trigger:focus,
	.combobox-container.has-errors .combobox-trigger:focus-visible {
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

	.trigger-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--font-size-base);
		color: var(--text-normal);
	}

	.search-input {
		width: 100%;
		margin-bottom: var(--spacing-1);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-base);
		border: 1px solid var(--border-primary);
		font-size: var(--font-size-base);
		box-sizing: border-box;
	}

	.search-input:focus,
	.search-input:focus-visible {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 28px;
		padding: 0 var(--spacing-2);
		overflow: hidden;
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

	.dropdown-panel {
		position: absolute;
		top: calc(100% + var(--spacing-1));
		left: 0;
		right: 0;
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
		min-width: 100%;
	}

	.dropdown-panel.align-right {
		left: auto;
		right: 0;
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
		.combobox-container:not(.size-xl) {
			height: 44px;
			min-height: 44px;
		}

		.combobox-container .option-item {
			height: auto;
			min-height: 44px;
		}

		.combobox-container .search-input,
		.combobox-container .loading-container {
			min-height: 44px;
		}
	}
</style>
