import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'react-photo-view/dist/react-photo-view.css';
import { PhotoProvider } from 'react-photo-view';
import App from './App.tsx';
import './i18n'; // Import i18n for initialization
import { ErrorBoundary } from './components/shared';

// ─── Global Vite Dynamic Import Error Recovery ────────────────────────────────
// When a new production version is deployed, previous chunk hashes are removed from the server.
// If an active user requests a route whose chunk was replaced, Vite fires 'vite:preloadError'.
// We intercept this and reload the page so the browser loads the new index.html and chunks.
window.addEventListener('vite:preloadError', (event: any) => {
  event.preventDefault();
  const lastReload = sessionStorage.getItem('vite-preload-reload');
  const now = Date.now();
  // Prevent infinite reload loop: allow max once per 10 seconds
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem('vite-preload-reload', now.toString());
    console.warn('[Vite] Chunk loading error detected after deployment. Reloading application...');
    window.location.reload();
  }
});

// ─── PWA Service Worker Update Listener ──────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // When a new SW activates and claims clients, reload smoothly if not recently reloaded
    const lastSwReload = sessionStorage.getItem('sw-controller-reload');
    const now = Date.now();
    if (!lastSwReload || now - parseInt(lastSwReload, 10) > 10000) {
      sessionStorage.setItem('sw-controller-reload', now.toString());
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <PhotoProvider
          maskOpacity={0.8}
          speed={() => 300}
        >
          <App />
        </PhotoProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
