import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { AppNotification } from '../types';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getPushSubscriptionStatus,
  triggerTestPush,
} from '../api/api';
import {
  isPushSupported,
  getNotificationPermission,
  getActiveSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  getIOSPWAStatus,
} from '../services/pushNotification';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: (page?: number) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  totalPages: number;
  currentPage: number;
  // Web Push additions
  isPushSupported: boolean;
  isPushSubscribed: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  activeDevicesCount: number;
  isPushLoading: boolean;
  togglePush: () => Promise<{ success: boolean; error?: string }>;
  sendTestPushNotification: () => Promise<void>;
  syncPushStatus: () => Promise<void>;
  iosStatus: { isIOS: boolean; isStandalone: boolean };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : 'http://localhost:3001';


export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const socketRef = useRef<Socket | null>(null);

  // Web Push state
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [activeDevicesCount, setActiveDevicesCount] = useState(0);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [iosStatus, setIosStatus] = useState({ isIOS: false, isStandalone: false });

  // Fetch notifications from REST API
  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      setIsLoading(true);
      const data = await getNotifications(page, 20);
      setNotifications(data.notifications);
      setTotalPages(data.pagination.pages);
      setCurrentPage(data.pagination.page);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.count);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, []);

  // Socket.io connection
  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if logged out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const token = localStorage.getItem('userToken');
    if (!token) return;

    // Connect to socket.io with JWT auth
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('🔔 Notification socket connected');
    });

    socket.on('notification:new', (notification: AppNotification) => {
      // Prepend new notification to the list
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔔 Notification socket disconnected:', reason);
    });

    socketRef.current = socket;

    // Initial data fetch
    fetchNotifications();
    fetchUnreadCount();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  // Sync Push Notification status
  const syncPushStatus = useCallback(async () => {
    const supported = isPushSupported();
    setIosStatus(getIOSPWAStatus());

    if (!supported) {
      setPushPermission('unsupported');
      setIsPushSubscribed(false);
      return;
    }

    setPushPermission(getNotificationPermission());

    const activeSub = await getActiveSubscription();
    setIsPushSubscribed(!!activeSub);

    if (isAuthenticated) {
      try {
        const status = await getPushSubscriptionStatus();
        setActiveDevicesCount(status.activeDevicesCount);
      } catch (err) {
        console.warn('[Push] Failed to query push status:', err);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    syncPushStatus();
  }, [syncPushStatus]);

  // Toggle push notification subscription
  const togglePush = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsPushLoading(true);
    try {
      if (isPushSubscribed) {
        const res = await unsubscribeFromPush();
        if (res.success) {
          setIsPushSubscribed(false);
          setActiveDevicesCount((prev) => Math.max(0, prev - 1));
        }
        return res;
      } else {
        const res = await subscribeToPush();
        if (res.success) {
          setIsPushSubscribed(true);
          setPushPermission('granted');
          setActiveDevicesCount((prev) => prev + 1);
        }
        return res;
      }
    } finally {
      setIsPushLoading(false);
    }
  }, [isPushSubscribed]);

  // Trigger test push
  const sendTestPushNotification = useCallback(async () => {
    await triggerTestPush();
  }, []);


  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        fetchNotifications,
        markAsRead,
        markAllRead,
        totalPages,
        currentPage,
        isPushSupported: isPushSupported(),
        isPushSubscribed,
        pushPermission,
        activeDevicesCount,
        isPushLoading,
        togglePush,
        sendTestPushNotification,
        syncPushStatus,
        iosStatus,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}


export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export const useNotification = useNotifications;
