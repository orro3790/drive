/**
 * Page header state store.
 *
 * Child pages set header configuration (title, breadcrumbs, actions)
 * which the root layout's PageHeader reads from this store.
 */

import type { Snippet } from 'svelte';
import type { Breadcrumb } from '$lib/schemas/ui/breadcrumb';

interface PageHeaderState {
	title: string;
	breadcrumbs: Breadcrumb[];
	actionsSnippet: Snippet | undefined;
}

// Create the state using $state rune
const state = $state<PageHeaderState>({
	title: '',
	breadcrumbs: [],
	actionsSnippet: undefined
});

/**
 * Set the page title.
 */
function setTitle(title: string) {
	state.title = title;
}

/**
 * Set breadcrumbs for navigation.
 */
function setBreadcrumbs(breadcrumbs: Breadcrumb[]) {
	state.breadcrumbs = breadcrumbs;
}

/**
 * Set the actions snippet to render in the header.
 */
function setActionsSnippet(snippet: Snippet | undefined) {
	state.actionsSnippet = snippet;
}

/**
 * Configure header with all options at once.
 */
function configure(config: Partial<PageHeaderState>) {
	if (config.title !== undefined) state.title = config.title;
	if (config.breadcrumbs !== undefined) state.breadcrumbs = config.breadcrumbs;
	if (config.actionsSnippet !== undefined) state.actionsSnippet = config.actionsSnippet;
}

/**
 * Reset header to default state.
 */
function reset() {
	state.title = '';
	state.breadcrumbs = [];
	state.actionsSnippet = undefined;
}

// Export the store interface
export const pageHeaderStore = {
	get state() {
		return state;
	},
	setTitle,
	setBreadcrumbs,
	setActionsSnippet,
	configure,
	reset
};
