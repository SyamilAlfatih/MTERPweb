const express = require('express');
const { Notification, PushSubscription } = require('../models');
const { auth } = require('../middleware/auth');
const { archiveNotifications } = require('../utils/notificationLog');
const { getVapidPublicKey, sendPushToUsers, detectDeviceType } = require('../utils/webPush');

const router = express.Router();

// GET /api/notifications - List current user's notifications (paginated)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .sort({ isRead: 1, createdAt: -1 }) // Unread first, then newest
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: req.user._id }),
    ]);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/notifications/unread-count - Lightweight unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/notifications/read-all - Mark all user's notifications as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ msg: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    }).lean();

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    // Archive to log before deleting
    archiveNotifications([notification]);

    await Notification.deleteOne({ _id: req.params.id });
    res.json({ msg: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/notifications/clear - Delete all read notifications
router.delete('/clear', auth, async (req, res) => {
  try {
    // Find read notifications to archive before deleting
    const readNotifications = await Notification.find({
      recipient: req.user._id,
      isRead: true,
    }).lean();

    if (readNotifications.length > 0) {
      archiveNotifications(readNotifications);
      await Notification.deleteMany({
        recipient: req.user._id,
        isRead: true,
      });
    }

    res.json({ msg: `${readNotifications.length} notifications cleared` });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ── Web Push Notification Endpoints ──────────────────────────────────────────

// GET /api/notifications/vapid-public-key - Return public key for client registration
router.get('/vapid-public-key', auth, (req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ msg: 'WebPush is not configured on this server' });
  }
  res.json({ publicKey });
});

// POST /api/notifications/push-subscribe - Register or update a device push subscription
router.post('/push-subscribe', auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ msg: 'Invalid push subscription payload' });
    }

    const userAgent = req.headers['user-agent'] || '';
    const deviceType = detectDeviceType(userAgent);

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          user: req.user._id,
          endpoint,
          keys,
          userAgent,
          deviceType,
          lastActiveAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      msg: 'Push subscription registered successfully',
      subscriptionId: subscription._id,
    });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ msg: 'Failed to register push subscription' });
  }
});

// POST /api/notifications/push-unsubscribe - Remove a device push subscription
router.post('/push-unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ msg: 'Endpoint is required' });
    }

    await PushSubscription.deleteOne({
      endpoint,
      user: req.user._id,
    });

    res.json({ msg: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ msg: 'Failed to remove push subscription' });
  }
});

// GET /api/notifications/push-status - Check if current user has active subscriptions
router.get('/push-status', auth, async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find({ recipient: req.user._id })
      .select('deviceType userAgent lastActiveAt createdAt')
      .lean();

    // In model, field is 'user'
    const userSubs = await PushSubscription.find({ user: req.user._id })
      .select('deviceType userAgent lastActiveAt createdAt')
      .lean();

    res.json({
      hasSubscriptions: userSubs.length > 0,
      activeDevicesCount: userSubs.length,
      devices: userSubs,
    });
  } catch (error) {
    console.error('Push status error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/notifications/test-push - Send a test push notification to current user's devices
router.post('/test-push', auth, async (req, res) => {
  try {
    const results = await sendPushToUsers(req.user._id.toString(), {
      title: '🔔 Uji Coba Notifikasi MTERP',
      body: 'Web Push PWA berhasil dikonfigurasi! Notifikasi ERP akan muncul di perangkat ini.',
      data: {
        url: '/notifications',
        timestamp: Date.now(),
      },
    });

    res.json({
      msg: 'Test notification triggered',
      results,
    });
  } catch (error) {
    console.error('Test push error:', error);
    res.status(500).json({ msg: 'Failed to send test push notification' });
  }
});

module.exports = router;

