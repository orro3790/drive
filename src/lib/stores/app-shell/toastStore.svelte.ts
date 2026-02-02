/**
 * @module toastStore
 * @description Centralized store for ephemeral toast notifications.
 *
 * Design goals:
 * - Clear naming ("toast" vs vague "feedback").
 * - Simple API with sensible defaults and helpers per type.
 * - Manual dismissal and auto-dismiss timers.
 * - No coupling to editor nodes; targeting belongs to other UI.
 */

import type { Component } from 'svelte';
import * as m from '$lib/paraglide/messages.js';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export type ToastIcon = Component<Record<string, unknown>, Record<string, unknown>, ''>;

export type Toast = {
	id: number;
	title?: string;
	message: string;
	kind: ToastKind;
	durationMs: number; // 0 disables auto-dismiss
	icon?: ToastIcon;
};

const toasts = $state<Toast[]>([]);
let lastToastSignature = '';
let lastToastAt = 0;

function remove(id: number): void {
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx !== -1) toasts.splice(idx, 1);
}

function push(toast: Omit<Toast, 'id'>): number {
	// De-duplicate identical messages of same kind within short window
	const now = Date.now();
	const signature = `${toast.kind}|${toast.title ?? ''}|${toast.message}`;
	if (signature === lastToastSignature && now - lastToastAt < 1500) {
		return -1; // ignore duplicate burst
	}
	lastToastSignature = signature;
	lastToastAt = now;
	// Generate a more collision-resistant numeric id
	const rand =
		typeof crypto !== 'undefined' && 'getRandomValues' in crypto
			? crypto.getRandomValues(new Uint32Array(1))[0]
			: Math.floor(Math.random() * 0xffffffff);
	const id = (Date.now() & 0x7fffffff) ^ (rand >>> 0);
	toasts.unshift({
		...toast,
		id
	}); // newest first
	if (toast.durationMs > 0) {
		setTimeout(() => remove(id), toast.durationMs);
	}
	return id;
}

export const toastStore = {
	get toasts() {
		return toasts;
	},

	show(
		message: string,
		options: {
			kind?: ToastKind;
			title?: string;
			durationMs?: number;
			icon?: ToastIcon;
		} = {}
	): number {
		const { kind = 'info', title, durationMs = 5000, icon } = options;
		return push({
			kind,
			title,
			message,
			durationMs,
			icon
		});
	},

	success(message: string, title?: string, durationMs = 5000, icon?: ToastIcon): number {
		return push({
			kind: 'success',
			title: title ?? m.toast_title_success(),
			message,
			durationMs,
			icon
		});
	},

	error(message: string, title?: string, durationMs = 5000, icon?: ToastIcon): number {
		return push({
			kind: 'error',
			title: title ?? m.toast_title_error(),
			message,
			durationMs,
			icon
		});
	},

	warning(message: string, title?: string, durationMs = 5000, icon?: ToastIcon): number {
		return push({
			kind: 'warning',
			title: title ?? m.toast_title_warning(),
			message,
			durationMs,
			icon
		});
	},

	info(message: string, title?: string, durationMs = 5000, icon?: ToastIcon): number {
		return push({
			kind: 'info',
			title: title ?? m.toast_title_info(),
			message,
			durationMs,
			icon
		});
	},

	remove
};
