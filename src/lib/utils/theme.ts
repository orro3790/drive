/**
 * Theme utilities for Drive.
 * - Root switch: html[data-theme="dark"|"light"]
 * - No-flash bootstrap reads localStorage in app.html before paint
 * - Applies color-scheme on root for native UI consistency (scrollbars/forms)
 *
 * This module only manages DOM + localStorage. No server persistence.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'drive-theme';

/** Read theme currently applied to the DOM. */
export function getDomTheme(): Theme | null {
	if (typeof document === 'undefined') return null;
	const t = document.documentElement.getAttribute('data-theme');
	return t === 'dark' || t === 'light' ? t : null;
}

/** Apply theme to DOM (dataset + color-scheme) and persist to localStorage. */
export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-theme', theme);
	document.documentElement.style.setProperty('color-scheme', theme);
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// localStorage unavailable
	}
}

/** Read persisted theme from localStorage. */
export function getStoredTheme(): Theme | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const t = localStorage.getItem(STORAGE_KEY);
		return t === 'dark' || t === 'light' ? t : null;
	} catch {
		return null;
	}
}
