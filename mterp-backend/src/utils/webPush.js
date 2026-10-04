const webpush = require('web-push');
const { PushSubscription } = require('../models');

// Configure VAPID details if configured in environment
let isVapidConfigured = false;

function initVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@mterp.com';

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      isVapidConfigured = true;
      console.log('✅ WebPush VAPID configured successfully');
    } catch (err) {
      console.error('❌ Failed to configure WebPush VAPID:', err.message);
    }
  } else {
    console.warn('⚠️ WebPush VAPID keys missing in environment. Push notifications disabled.');
  }
}

// Call on startup
initVapid();

/**
 * Returns public key for client registration
 */
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Helper to classify user agent to mobile/desktop/tablet
 */
function detectDeviceType(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Sends a push notification to one or multiple users.
 * Automatically purges expired/unregistered subscriptions (HTTP 404/410).
 *
 * @param {string|string[]} userIds - User ID or array of user IDs
 * @param {Object} payload - { title, body, icon, badge, data, tag }
 */
async function sendPushToUsers(userIds, payload) {
  if (!isVapidConfigured) {
    initVapid();
    if (!isVapidConfigured) return;
  }

  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ids.length) return;

  try {
    const subscriptions = await PushSubscription.find({
      user: { $in: ids },
    }).lean();

    if (!subscriptions.length) return;

    const stringifiedPayload = JSON.stringify({
      title: payload.title || 'MTERP Notifikasi',
      body: payload.body || payload.message || '',
      icon: payload.icon || '/apple-touch-icon-180x180.png',
      badge: payload.badge || '/hard-hat.svg',
      data: payload.data || {},
      tag: payload.tag || `mterp-${Date.now()}`,
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, stringifiedPayload);
          // Update lastActiveAt
          await PushSubscription.updateOne(
            { _id: sub._id },
            { $set: { lastActiveAt: new Date() } }
          );
        } catch (err) {
          // 404 Not Found or 410 Gone means the subscription is no longer valid
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(`🧹 Removing expired push subscription for endpoint: ${sub.endpoint.slice(0, 30)}...`);
            await PushSubscription.deleteOne({ _id: sub._id });
          } else {
            console.warn(`⚠️ Push send failed for endpoint ${sub.endpoint.slice(0, 30)}...:`, err.message);
          }
        }
      })
    );

    return results;
  } catch (err) {
    console.error('sendPushToUsers error:', err.message);
  }
}

module.exports = {
  getVapidPublicKey,
  sendPushToUsers,
  detectDeviceType,
  initVapid,
};
