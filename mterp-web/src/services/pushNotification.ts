import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../api/api';

/**
 * Converts a base64 string to a Uint8Array suitable for applicationServerKey
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if the current browser environment supports the Web Push API
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Checks if the user is on an iOS device and whether it's running in PWA standalone mode
 */
export function getIOSPWAStatus(): { isIOS: boolean; isStandalone: boolean } {
  if (typeof window === 'undefined') return { isIOS: false, isStandalone: false };

  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  return { isIOS, isStandalone };
}

/**
 * Returns current browser notification permission
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Gets the active PushSubscription instance from the browser's ServiceWorker
 */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn('[Push] Error checking active subscription:', err);
    return null;
  }
}

/**
 * Subscribes current device to Web Push notifications:
 * 1. Requests browser notification permission
 * 2. Fetches VAPID public key from backend
 * 3. Subscribes via PushManager
 * 4. Persists subscription to backend MongoDB
 */
export async function subscribeToPush(): Promise<{
  success: boolean;
  subscription?: PushSubscription;
  error?: string;
}> {
  if (!isPushSupported()) {
    const { isIOS, isStandalone } = getIOSPWAStatus();
    if (isIOS && !isStandalone) {
      return {
        success: false,
        error: 'Tambahkan aplikasi ini ke Layar Utama (Home Screen) iPhone/iPad untuk mengaktifkan notifikasi.',
      };
    }
    return { success: false, error: 'Peramban ini tidak mendukung Web Push Notification.' };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error:
          permission === 'denied'
            ? 'Izin notifikasi diblokir di browser. Mohon izinkan di Pengaturan Situs peramban.'
            : 'Izin notifikasi belum diberikan.',
      };
    }

    // 2. Fetch VAPID public key
    const { publicKey } = await getVapidPublicKey();
    if (!publicKey) {
      return { success: false, error: 'Server belum mengonfigurasi VAPID key.' };
    }

    // 3. Ensure service worker is ready
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // If subscription already exists, ensure it is registered on server
    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    // 4. Send subscription keys to backend
    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, error: 'Data subscription tidak lengkap.' };
    }

    await registerPushSubscription({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
    });

    return { success: true, subscription };
  } catch (err: unknown) {
    console.error('[Push] subscribe error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal mengaktifkan push notifikasi.',
    };
  }
}

/**
 * Unsubscribes current device from Web Push notifications:
 * 1. Calls backend to delete endpoint
 * 2. Unsubscribes via PushManager
 */
export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifikasi tidak didukung.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // 1. Remove from backend
      try {
        await unregisterPushSubscription(subscription.endpoint);
      } catch (backendErr) {
        console.warn('[Push] Error unregistering from backend:', backendErr);
      }

      // 2. Unsubscribe in browser
      await subscription.unsubscribe();
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('[Push] unsubscribe error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal menonaktifkan notifikasi.',
    };
  }
}
