require('dotenv').config();
const admin = require('firebase-admin');

if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
		})
	});
}

const messaging = admin.messaging();
const token =
	'f8RQRQY1SGmBWafsC-YV2z:APA91bH4WBdxl1WIGPfSp1MzK3fO_MQoiBhRMpuGKtDkgOCSW8tekuFW4-8HCO3D3C6EFPiF-R8bFZBFKKxDfWiJoQfR-oNZscHp8zrT1ltbKrWiXewByDM';

(async () => {
	try {
		const result = await messaging.send({
			token,
			notification: {
				title: 'Bid Won',
				body: 'You won SE-004 for Sat, Feb 21 at 9:00 AM'
			},
			android: {
				priority: 'high',
				notification: {
					channelId: 'drive_notifications'
				}
			}
		});
		console.log('SUCCESS! Message ID:', result);
	} catch (err) {
		console.error('FAILED:', err.code, err.message);
	}
})();
