export type PasswordChangeErrorCode =
	| 'invalid_password'
	| 'no_credential_account'
	| 'password_update_failed';

export interface PasswordChangeFailure {
	status: number;
	message: PasswordChangeErrorCode;
}

export function mapChangePasswordFailure(
	message: string | null,
	fallbackStatus: number
): PasswordChangeFailure {
	if (message === 'INVALID_PASSWORD') {
		return { status: 400, message: 'invalid_password' };
	}

	if (message === 'CREDENTIAL_ACCOUNT_NOT_FOUND') {
		return { status: 400, message: 'no_credential_account' };
	}

	return {
		status: fallbackStatus >= 400 && fallbackStatus < 600 ? fallbackStatus : 400,
		message: 'password_update_failed'
	};
}
