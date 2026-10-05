import { lazy, ComponentType } from 'react';

/**
 * Wraps React.lazy with automatic retry and reload recovery for chunk loading errors.
 *
 * When a new version of the app is deployed to production, older hashed chunks
 * (e.g. assets/GroupAttendance-xyz.js) are replaced on the server. If an active
 * user or open tab attempts to navigate to a lazy-loaded route, the browser throws:
 * "TypeError: error loading dynamically imported module: ..."
 *
 * This utility catches such dynamic import failures, ensures the browser hasn't
 * entered an infinite reload loop, updates the PWA Service Worker if present,
 * and forces a page reload so the latest index.html and fresh bundles are loaded.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string
) {
  return lazy(async () => {
    const storageKey = `retry_import_${chunkName || 'chunk'}`;
    const alreadyRetried = sessionStorage.getItem(storageKey);

    try {
      const module = await factory();
      // Clear flag after successful load
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error: any) {
      const errorMsg = String(error?.message || error || '');
      const isDynamicImportError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Loading chunk') ||
        errorMsg.includes('Importing a module script failed') ||
        error?.name === 'TypeError';

      if (isDynamicImportError && !alreadyRetried) {
        sessionStorage.setItem(storageKey, Date.now().toString());
        console.warn(
          `[lazyWithRetry] Dynamic import failed for chunk "${chunkName || 'unknown'}". New deployment detected. Reloading page...`
        );

        // Notify Service Worker to update precache if running PWA
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.update();
            }
          } catch {
            // Ignore SW update errors
          }
        }

        // Force reload from server to get new index.html and asset hashes
        window.location.reload();

        // Return a pending promise while the browser initiates reload
        return new Promise<{ default: T }>(() => {});
      }

      // If already retried or unrecoverable error, pass to ErrorBoundary
      throw error;
    }
  });
}
