const { Notification, User } = require('../models');
const { sendPushToUsers } = require('./webPush');

// Will be set by server.js after socket.io is initialized
let io = null;

/**
 * Determine destination URL for push notification click deep linking
 */
function resolveNotificationUrl(doc) {
  if (doc.data?.spklId || doc.type === 'spkl') return '/spkl';
  if (doc.data?.taskId) return `/tasks?id=${doc.data.taskId}`;
  if (doc.data?.requestId) return `/requests`;
  if (doc.data?.kasbonId) return `/kasbon`;
  if (doc.data?.reportId && doc.data?.projectId) return `/projects/${doc.data.projectId}/reports`;
  if (doc.data?.projectId) return `/projects/${doc.data.projectId}`;
  return '/notifications';
}

/**
 * Set the socket.io instance. Called once from server.js.
 */
function setIO(socketIO) {
  io = socketIO;
}

/**
 * Create notification(s) for one or multiple recipients and emit via socket.io & Web Push.
 * Fire-and-forget — never blocks the calling route.
 *
 * @param {Object|Object[]} opts - Single or array of { recipient, type, title, message, data }
 */
async function notify(opts) {
  try {
    const items = Array.isArray(opts) ? opts : [opts];
    const docs = await Notification.insertMany(
      items.map((item) => ({
        recipient: item.recipient,
        type: item.type || 'general',
        title: item.title,
        message: item.message,
        data: item.data || {},
      }))
    );

    // Emit real-time event to each recipient's socket room
    if (io) {
      for (const doc of docs) {
        const recipientId = doc.recipient.toString();
        io.to(recipientId).emit('notification:new', {
          _id: doc._id,
          type: doc.type,
          title: doc.title,
          message: doc.message,
          data: doc.data,
          isRead: doc.isRead,
          createdAt: doc.createdAt,
        });
      }
    }

    // Dispatch Web Push notification to recipient devices (runs in background)
    for (const doc of docs) {
      sendPushToUsers(doc.recipient.toString(), {
        title: doc.title,
        body: doc.message,
        data: {
          id: doc._id.toString(),
          type: doc.type,
          url: resolveNotificationUrl(doc),
        },
      }).catch((err) => {
        console.error('WebPush dispatch error:', err.message);
      });
    }

    return docs;
  } catch (err) {
    console.error('notify() error:', err.message);
  }
}


/**
 * Notify all users with specific roles.
 * Looks up users by role, then creates one notification per user.
 *
 * @param {string[]} roles - e.g. ['owner', 'director']
 * @param {Object} notifData - { type, title, message, data }
 * @param {string} [excludeUserId] - Optional userId to exclude (e.g. the actor)
 */
async function notifyByRole(roles, notifData, excludeUserId) {
  try {
    const users = await User.find({
      role: { $in: roles },
      isVerified: true,
    }).select('_id').lean();

    const recipients = users
      .map((u) => u._id.toString())
      .filter((id) => id !== excludeUserId);

    if (recipients.length === 0) return;

    const items = recipients.map((recipientId) => ({
      recipient: recipientId,
      type: notifData.type || 'general',
      title: notifData.title,
      message: notifData.message,
      data: notifData.data || {},
    }));

    await notify(items);
  } catch (err) {
    console.error('notifyByRole() error:', err.message);
  }
}

module.exports = { notify, notifyByRole, setIO };
