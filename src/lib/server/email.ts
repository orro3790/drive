import { resetPasswordHtml } from './emails/resetPassword';
import logger from './logger';

/**
 * Send password reset email via Resend API.
 *
 * This function intentionally does not throw on failure to prevent timing attacks
 * that could reveal whether an email exists in the system.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
	const resendKey = process.env.RESEND_API_KEY;
	if (!resendKey) {
		logger.error('RESEND_API_KEY not configured - password reset email not sent');
		return;
	}

	// Derive app origin from reset URL
	const url = new URL(resetUrl);
	const appOrigin = url.origin;

	// Replace placeholders in template
	const html = resetPasswordHtml
		.replace(/\{\{\s*handlerUrl\s*\}\}/g, resetUrl)
		.replace(/\{\{\s*year\s*\}\}/g, String(new Date().getFullYear()))
		.replace(/\{\{\s*appOrigin\s*\}\}/g, appOrigin);

	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${resendKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: process.env.EMAIL_FROM || 'Drive <noreply@yourdomain.com>',
				to,
				subject: 'Reset your password',
				html
			})
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'unknown error');
			logger.error({ email: to, status: response.status, error: errorText }, 'Password reset email failed');
			return;
		}

		const result = (await response.json()) as { id?: string };
		logger.info({ email: to, emailId: result.id }, 'Password reset email sent');
	} catch (err) {
		logger.error({ email: to, error: err instanceof Error ? err.message : 'unknown' }, 'Password reset email failed');
	}
}
