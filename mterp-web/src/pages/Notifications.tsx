import { useState, useEffect, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ClipboardList,
  CheckCircle2,
  XCircle,
  FileText,
  HardHat,
  DollarSign,
  Clock,
  Megaphone,
  Trash2,
  CheckCheck,
  Filter,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../contexts/NotificationContext';
import { clearReadNotifications, deleteNotification } from '../api/api';
import type { AppNotification, NotificationType } from '../types';

/* ── Notification type → icon/color mapping ── */
const TYPE_CONFIG: Record<NotificationType, { icon: ElementType; color: string; bg: string }> = {
  task_assigned:    { icon: ClipboardList, color: '#D97706', bg: '#FEF3C7' },
  task_completed:   { icon: CheckCircle2,  color: '#059669', bg: '#D1FAE5' },
  request_approved: { icon: CheckCircle2,  color: '#10B981', bg: '#D1FAE5' },
  request_rejected: { icon: XCircle,       color: '#EF4444', bg: '#FEE2E2' },
  kasbon_approved:  { icon: DollarSign,    color: '#10B981', bg: '#D1FAE5' },
  kasbon_rejected:  { icon: XCircle,       color: '#EF4444', bg: '#FEE2E2' },
  daily_report:     { icon: FileText,      color: '#3B82F6', bg: '#DBEAFE' },
  project_created:  { icon: HardHat,       color: '#D97706', bg: '#FEF3C7' },
  report_approved:  { icon: CheckCircle2,  color: '#059669', bg: '#D1FAE5' },
  attendance_permit:{ icon: Clock,         color: '#7C3AED', bg: '#EDE9FE' },
  general:          { icon: Megaphone,     color: '#6366F1', bg: '#EEF2FF' },
};

function getConfig(type: NotificationType) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.general;
}

/* ── Time ago helper ── */
function timeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ── Notification Card ── */
function NotificationCard({
  notification,
  onRead,
  onDelete,
  onNavigate,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (n: AppNotification) => void;
}) {
  const config = getConfig(notification.type);
  const Icon = config.icon;

  return (
    <div
      className={`group flex gap-3 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
        notification.isRead
          ? 'bg-bg-white border-border-light opacity-70 hover:opacity-100'
          : 'bg-bg-white border-primary/20 shadow-sm hover:shadow-md hover:border-primary/40'
      }`}
      onClick={() => {
        if (!notification.isRead) onRead(notification._id);
        onNavigate(notification);
      }}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
        style={{ backgroundColor: config.bg }}
      >
        <Icon size={20} style={{ color: config.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-wider leading-none">
              {notification.title}
            </span>
            {!notification.isRead && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] text-text-muted shrink-0 font-medium">
            {timeAgo(notification.createdAt)}
          </span>
        </div>
        <p className="text-sm font-semibold text-text-primary m-0 leading-snug line-clamp-2">
          {notification.message}
        </p>
      </div>

      {/* Delete button */}
      <button
        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center bg-bg-secondary hover:bg-red-50 hover:text-red-500 text-text-muted transition-all duration-200 shrink-0 self-center cursor-pointer border-none"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notification._id);
        }}
        aria-label="Delete notification"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ── Main Page ── */
export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllRead,
    totalPages,
    currentPage,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [clearing, setClearing] = useState(false);

  const filteredNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const handleNavigate = (n: AppNotification) => {
    if (n.data?.taskId) navigate('/tasks');
    else if (n.data?.projectId) navigate(`/project/${n.data.projectId}`);
    else if (n.data?.requestId) navigate('/approvals');
    else if (n.data?.kasbonId) navigate('/approvals');
    else if (n.data?.reportId && n.data?.projectId) navigate(`/project-reports/${n.data.projectId}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      fetchNotifications(currentPage);
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      setClearing(true);
      await clearReadNotifications();
      fetchNotifications(1);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 lg:p-6 max-w-[820px]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-md">
            <Bell size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-primary m-0 tracking-tight">Notifications</h2>
            <p className="text-sm text-text-muted font-medium m-0">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'All caught up!'
              }
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors cursor-pointer border-none"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          )}
          <button
            onClick={handleClearAll}
            disabled={clearing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-secondary text-text-muted text-xs font-bold hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer border border-border-light disabled:opacity-50"
          >
            <Trash2 size={14} />
            {clearing ? 'Clearing...' : 'Clear read'}
          </button>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-bg-secondary rounded-xl mb-4 w-fit">
        {(['all', 'unread'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border-none ${
              filter === tab
                ? 'bg-bg-white text-text-primary shadow-sm'
                : 'bg-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab === 'all' ? 'All' : 'Unread'}
            {tab === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-black">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Notification List ── */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 p-4 bg-bg-white rounded-2xl border border-border-light">
              <div className="w-11 h-11 rounded-xl bg-border-light animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-3 w-1/3 rounded bg-border-light animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-border-light animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-border-light animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-bg-white rounded-2xl border-2 border-dashed border-border-light text-center">
          <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-4">
            <Inbox size={32} className="text-text-muted" />
          </div>
          <p className="text-base font-bold text-text-primary m-0 mb-1">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-sm text-text-muted m-0">
            {filter === 'unread'
              ? 'You\'re all caught up! 🎉'
              : 'When something happens, you\'ll see it here.'
            }
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification._id}
              notification={notification}
              onRead={markAsRead}
              onDelete={handleDelete}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => fetchNotifications(currentPage - 1)}
            disabled={currentPage <= 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-bg-white border border-border-light text-sm font-semibold text-text-secondary hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            Prev
          </button>
          <span className="text-xs font-bold text-text-muted">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => fetchNotifications(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-bg-white border border-border-light text-sm font-semibold text-text-secondary hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className="h-4 lg:hidden" />
    </div>
  );
}
