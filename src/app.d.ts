// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session?: {
				id: string;
				userId: string;
				expiresAt: Date;
				createdAt: Date;
				updatedAt: Date;
			};
			user?: {
				id: string;
				email: string;
				name: string;
				role: 'driver' | 'manager';
				createdAt: Date;
				updatedAt: Date;
			};
			userId?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
