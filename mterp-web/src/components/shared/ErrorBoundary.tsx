import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Home, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkLoadError: boolean;
  isReloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunkLoadError: false,
    isReloading: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    const errorMsg = String(error?.message || error || '');
    const isChunkLoadError =
      errorMsg.includes('dynamically imported module') ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('Importing a module script failed') ||
      error?.name === 'TypeError';

    return {
      hasError: true,
      error,
      isChunkLoadError,
      isReloading: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error caught by boundary:', error, errorInfo);
  }

  private handleHardReload = async () => {
    this.setState({ isReloading: true });

    try {
      // Clear Service Worker caches if available
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      // Update Service Worker registrations
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.update()));
      }
    } catch (e) {
      console.warn('[ErrorBoundary] Cache clearing error:', e);
    }

    // Force reload from server
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = this.state.isChunkLoadError;

      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 text-center animate-fade-in">
            {/* Top Icon Badge */}
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-inner transition-transform hover:scale-105 duration-200 bg-primary/10 text-primary">
              {isChunkError ? (
                <Sparkles className="w-8 h-8 animate-pulse text-primary" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {isChunkError ? 'Pembaruan Sistem Tersedia' : 'Terjadi Kendala Memuat Halaman'}
            </h2>

            {/* Description */}
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {isChunkError
                ? 'Versi aplikasi MTERP terbaru telah dirilis di server. Muat ulang halaman sekarang untuk memperbarui berkas dan modul sistem.'
                : 'Aplikasi mendeteksi kendala saat memproses tampilan ini. Anda dapat memuat ulang untuk mencoba kembali.'}
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={this.handleHardReload}
                disabled={this.state.isReloading}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm shadow-md shadow-primary/20 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${this.state.isReloading ? 'animate-spin' : ''}`} />
                {this.state.isReloading ? 'Memperbarui...' : isChunkError ? 'Perbarui & Muat Ulang Sekarang' : 'Muat Ulang Halaman'}
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-medium text-sm transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4 text-slate-500" />
                Kembali ke Beranda
              </button>
            </div>

            {/* Collapsible Error Debug Info (for devs) */}
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="mt-6 text-left border-t border-slate-100 dark:border-slate-800 pt-4">
                <span className="text-[11px] font-mono text-slate-400 block mb-1">Detail Kesalahan:</span>
                <p className="text-xs font-mono text-rose-500 break-words bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-lg">
                  {this.state.error.message}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
