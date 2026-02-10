import { describe, expect, it } from 'vitest';

import { mapChangePasswordFailure } from '../../src/lib/server/password-change-error-mapping';

describe('password change error mapping', () => {
	it('maps invalid current password to legacy API contract', () => {
		expect(mapChangePasswordFailure('INVALID_PASSWORD', 400)).toEqual({
			status: 400,
			error: 'invalid_password'
		});
	});

	it('maps missing credential account to legacy API contract', () => {
		expect(mapChangePasswordFailure('CREDENTIAL_ACCOUNT_NOT_FOUND', 400)).toEqual({
			status: 400,
			error: 'no_credential_account'
		});
	});

	it('falls back to safe generic error for unknown auth failures', () => {
		expect(mapChangePasswordFailure('SOMETHING_ELSE', 503)).toEqual({
			status: 503,
			error: 'password_update_failed'
		});
	});
});
