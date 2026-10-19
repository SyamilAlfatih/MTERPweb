import { api } from './client';

// === NOTIFICATIONS API ===

export const getNotifications = async (page = 1, limit = 20) => {
  const response = await api.get(`/notifications?page=${page}&limit=${limit}`);
  return response.data;
};

export const getUnreadCount = async () => {
  const response = await api.get('/notifications/unread-count');
  return response.data;
};

export const markNotificationRead = async (id: string) => {
  const response = await api.put(`/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.put('/notifications/read-all');
  return response.data;
};

export const deleteNotification = async (id: string) => {
  const response = await api.delete(`/notifications/${id}`);
  return response.data;
};

export const clearReadNotifications = async () => {
  const response = await api.delete('/notifications/clear');
  return response.data;
};

// === WEB PUSH NOTIFICATIONS API ===

export const getVapidPublicKey = async (): Promise<{ publicKey: string }> => {
  const response = await api.get('/notifications/vapid-public-key');
  return response.data;
};

export const registerPushSubscription = async (subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) => {
  const response = await api.post('/notifications/push-subscribe', subscription);
  return response.data;
};

export const unregisterPushSubscription = async (endpoint: string) => {
  const response = await api.post('/notifications/push-unsubscribe', { endpoint });
  return response.data;
};

export const getPushSubscriptionStatus = async (): Promise<{
  hasSubscriptions: boolean;
  activeDevicesCount: number;
  devices: Array<{ deviceType: string; userAgent: string; lastActiveAt: string }>;
}> => {
  const response = await api.get('/notifications/push-status');
  return response.data;
};

export const triggerTestPush = async () => {
  const response = await api.post('/notifications/test-push');
  return response.data;
};

// === ATTENDANCE SESSION API ===

export const getAttendanceSessions = async (params?: {
  date?: string;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  supervisorId?: string;
  status?: string;
  unclosedOnly?: boolean | string;
  page?: number;
  limit?: number;
}) => {
  const response = await api.get('/attendance-session', { params });
  return response.data;
};

export const getUnclosedAttendanceSessions = async (params?: { supervisorId?: string; projectId?: string }) => {
  const response = await api.get('/attendance-session/unclosed', { params });
  return response.data;
};

export const deleteAttendanceSession = async (sessionId: string) => {
  const response = await api.delete(`/attendance-session/${sessionId}`);
  return response.data;
};

// === TASK MANAGEMENT API ===

export const completeTaskWithEvidence = async (taskId: string, formData: FormData) => {
  const response = await api.post(`/tasks/${taskId}/complete`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const sendTaskReminder = async (taskId: string) => {
  const response = await api.post(`/tasks/${taskId}/remind`);
  return response.data;
};
