import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }: { locals: App.Locals }) => {
	if (!locals.user) {
		return {};
	}

	if (locals.user.role === 'manager') {
		throw redirect(302, '/routes');
	}

	throw redirect(302, '/dashboard');
};
