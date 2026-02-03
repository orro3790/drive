export const resetPasswordHtml = `<!doctype html>
<html>
	<head>
		<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
	</head>
	<body style="background-color: #f6f7f9">	<div style="margin-left: auto; margin-right: auto; max-width: 560px; padding: 16px">
		<div style="border-radius: 12px; background-color: #fffffe; padding: 24px">
			<div style="font-size: 16px; font-weight: 700; color: #111827">Drive</div>
			<div style="margin-bottom: 12px; margin-top: 8px; font-size: 20px; font-weight: 700; color: #111827">Reset your password</div>
			<p style="line-height: 24px; color: #374151">
				We received a request to reset the password for your Drive account.
			</p>
			<p style="line-height: 24px; color: #374151">
				Click the button below to return to our app and securely set a new password.
			</p>
			<div style="margin-top: 12px">
				<a href="{{ handlerUrl }}" style="display: inline-block; border-radius: 8px; background-color: #111827; padding-left: 16px; padding-right: 16px; padding-top: 8px; padding-bottom: 8px; font-weight: 600; color: #fffffe; text-decoration: none">Reset password</a>
			</div>
			<p style="margin-top: 12px; font-size: 12px; color: #6b7280">
				If you didn't request a password reset, you can safely ignore this email.
			</p>
			<p style="margin-top: 4px; font-size: 12px; color: #6b7280">
				If the button doesn't work, copy and paste this URL:<br>{{ handlerUrl }}
			</p>
		</div>
		<div style="margin-top: 16px; text-align: center; font-size: 12px; color: #6b7280">
			© {{ year }} Drive • {{ appOrigin }}
		</div>
	</div>
	</body>
</html>
`;
