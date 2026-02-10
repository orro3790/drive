import * as m from '$lib/paraglide/messages.js';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

function isOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function ensureOnlineForWrite(): boolean {
	if (!isOffline()) {
		return true;
	}

	toastStore.error(m.offline_requires_connectivity());
	return false;
}
