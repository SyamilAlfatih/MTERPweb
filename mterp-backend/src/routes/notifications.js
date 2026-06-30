const express = require('express');
const { Notification } = require('../models');
const { auth } = require('../middleware/auth');
const { archiveNotifications } = require('../utils/notificationLog');

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

module.exports = router;
