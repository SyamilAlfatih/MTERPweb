import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';

export function PushNotificationSettings() {
  const {
    isPushSupported,
    isPushSubscribed,
    pushPermission,
    activeDevicesCount,
    isPushLoading,
    togglePush,
    sendTestPushNotification,
    iosStatus,
  } = useNotifications();

  const [testSent, setTestSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleToggle = async () => {
    setErrorMessage(null);
    setTestSent(false);
    const res = await togglePush();
    if (!res.success && res.error) {
      setErrorMessage(res.error);
    }
  };

  const handleTestPush = async () => {
    try {
      setIsTesting(true);
      setErrorMessage(null);
      await sendTestPushNotification();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengirim notifikasi uji coba.'
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm p-4 sm:p-5 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Icon & Title */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              isPushSubscribed
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-primary/10 text-primary'
            }`}
          >
            {isPushSubscribed ? <BellRing size={24} /> : <Bell size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                Push Notifikasi Perangkat (PWA)
              </h3>
              {/* Status Badge */}
              {isPushSubscribed ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Aktif
                </span>
              ) : pushPermission === 'denied' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                  <AlertTriangle size={12} />
                  Diblokir Browser
                </span>
              ) : !isPushSupported ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                  Tidak Didukung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  Belum Aktif
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
              Dapatkan pemberitahuan penugasan tugas, persetujuan kasbon, dan laporan harian bahkan saat aplikasi ditutup.
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {isPushSubscribed && (
            <button
              type="button"
              onClick={handleTestPush}
              disabled={isTesting}
              title="Kirim notifikasi uji coba ke perangkat ini"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all min-h-[44px]"
            >
              {isTesting ? (
                <Loader2 size={15} className="animate-spin text-primary" />
              ) : (
                <Send size={14} className="text-gray-500" />
              )}
              <span>{isTesting ? 'Mengirim...' : 'Uji Coba'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={isPushLoading || (!isPushSupported && !iosStatus.isIOS)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[44px] min-w-[130px] ${
              isPushSubscribed
                ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200'
                : 'bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow active:scale-95'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPushLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Memproses...</span>
              </>
            ) : isPushSubscribed ? (
              <>
                <BellOff size={16} />
                <span>Nonaktifkan</span>
              </>
            ) : (
              <>
                <Bell size={16} />
                <span>Aktifkan Notifikasi</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info / Device count footer */}
      {isPushSubscribed && activeDevicesCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Smartphone size={14} className="text-emerald-600" />
            <span>
              {activeDevicesCount} perangkat terhubung dengan notifikasi push akun Anda
            </span>
          </div>
          {testSent && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 size={13} />
              Notifikasi uji coba berhasil dikirim!
            </span>
          )}
        </div>
      )}

      {/* Warning for Browser Permission Denied */}
      {pushPermission === 'denied' && (
        <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
          <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Izin Notifikasi Diblokir di Peramban</p>
            <p className="text-amber-700 leading-normal">
              Untuk mengaktifkan, klik ikon gembok/setelan situs di samping kolom URL browser Anda, ubah izin Notifikasi menjadi <strong>Izinkan</strong>, lalu muat ulang halaman.
            </p>
          </div>
        </div>
      )}

      {/* Guide for iOS Safari users who haven't added to Home Screen */}
      {iosStatus.isIOS && !iosStatus.isStandalone && (
        <div className="mt-3.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
          <Info size={16} className="shrink-0 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Petunjuk Pengguna iPhone / iPad (iOS 16.4+)</p>
            <p className="text-blue-800 leading-normal">
              Agar Web Push dapat aktif di iOS, tekan tombol <strong>Share</strong> (ikon kotak dengan panah atas di Safari), lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>. Buka aplikasi dari layar utama untuk mengaktifkan notifikasi.
            </p>
          </div>
        </div>
      )}

      {/* Error message alert */}
      {errorMessage && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
