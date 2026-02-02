/**
 * App sidebar state store.
 *
 * Manages sidebar expanded/collapsed state with localStorage persistence,
 * and mobile overlay state.
 */

type SidebarState = {
	state: 'expanded' | 'collapsed';
	isMobile: boolean;
};

const STORAGE_KEY = 'sidebarExpanded';

/**
 * Get initial state from localStorage (desktop only).
 */
function getInitialState(): 'expanded' | 'collapsed' {
	if (typeof window === 'undefined') return 'collapsed';
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'true' ? 'expanded' : 'collapsed';
	} catch {
		return 'collapsed';
	}
}

// Create the state using $state rune
const state = $state<SidebarState>({
	state: getInitialState(),
	isMobile: false
});

/**
 * Persist sidebar expanded state to localStorage.
 */
function persistState() {
	if (typeof window === 'undefined' || state.isMobile) return;
	try {
		localStorage.setItem(STORAGE_KEY, String(state.state === 'expanded'));
	} catch {
		// Ignore storage errors
	}
}

/**
 * Toggles the sidebar between expanded and collapsed states.
 */
function toggle() {
	state.state = state.state === 'expanded' ? 'collapsed' : 'expanded';
	persistState();
}

/**
 * Expands the sidebar.
 */
function expand() {
	state.state = 'expanded';
	persistState();
}

/**
 * Collapses the sidebar.
 */
function collapse() {
	state.state = 'collapsed';
	persistState();
}

/**
 * Sets the mobile state of the sidebar.
 * On mobile, sidebar starts collapsed and doesn't persist.
 */
function setMobile(isMobile: boolean) {
	const wasMobile = state.isMobile;
	state.isMobile = isMobile;

	// When switching to mobile, collapse. When switching to desktop, restore persisted state.
	if (isMobile && !wasMobile) {
		state.state = 'collapsed';
	} else if (!isMobile && wasMobile) {
		state.state = getInitialState();
	}
}

/**
 * Resets the sidebar to its default state.
 */
function reset() {
	state.state = 'collapsed';
	state.isMobile = false;
}

// Export the store interface
export const appSidebarStore = {
	get state() {
		return state;
	},
	toggle,
	expand,
	collapse,
	setMobile,
	reset
};
