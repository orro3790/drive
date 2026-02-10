// See https://svelte.dev/docs/kit/types#app.d.ts
import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session?: AuthSession['session'];
			user?: AuthSession['user'];
			userId?: string;
			requestId?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
