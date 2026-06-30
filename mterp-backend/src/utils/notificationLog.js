const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');

/**
 * Ensure logs directory exists.
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Get the current month's log file path.
 * Format: notifications-YYYY-MM.log
 */
function getLogFilePath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return path.join(LOG_DIR, `notifications-${year}-${month}.log`);
}

/**
 * Archive a single notification to the log file.
 * @param {Object} notification - The notification document (plain object)
 */
function archiveNotification(notification) {
  try {
    ensureLogDir();
    const logEntry = {
      archivedAt: new Date().toISOString(),
      _id: notification._id,
      recipient: notification.recipient,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data || {},
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    };
    const line = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch (err) {
    console.error('Failed to archive notification to log:', err.message);
  }
}

/**
 * Archive multiple notifications to the log file.
 * @param {Object[]} notifications - Array of notification documents
 */
function archiveNotifications(notifications) {
  if (!notifications || notifications.length === 0) return;
  try {
    ensureLogDir();
    const lines = notifications.map((n) => {
      const logEntry = {
        archivedAt: new Date().toISOString(),
        _id: n._id,
        recipient: n.recipient,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data || {},
        isRead: n.isRead,
        createdAt: n.createdAt,
      };
      return JSON.stringify(logEntry);
    });
    fs.appendFileSync(getLogFilePath(), lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to archive notifications to log:', err.message);
  }
}

module.exports = { archiveNotification, archiveNotifications };
