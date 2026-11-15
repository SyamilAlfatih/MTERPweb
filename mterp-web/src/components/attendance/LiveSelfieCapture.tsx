import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { verifySelfieHasFace } from '../../utils/faceDetection';

const MAX_MOBILE_CAPTURE_AGE_MS = 90_000;

interface LiveSelfieCaptureProps {
  previewUrl: string | null;
  onCapture: (file: File, previewUrl: string) => void;
  onClear: () => void;
  onError?: (msg: string) => void;
  title?: string;
  accent?: 'emerald' | 'red' | 'primary';
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export const LiveSelfieCapture: React.FC<LiveSelfieCaptureProps> = ({
  previewUrl,
  onCapture,
  onClear,
  onError,
  title = 'Ambil Foto Selfie Langsung',
  accent = 'emerald',
}) => {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const [localError, setLocalError] = useState('');
  const [allowMobileFallback, setAllowMobileFallback] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const reportError = (msg: string) => {
    setLocalError(msg);
    onError?.(msg);
  };

  const processCandidateFile = async (file: File, fromLiveCanvas: boolean) => {
    setLocalError('');

    // Reject stale / previously saved gallery files when coming from mobile capture fallback
    if (!fromLiveCanvas && file.lastModified) {
      const ageMs = Date.now() - file.lastModified;
      if (ageMs > MAX_MOBILE_CAPTURE_AGE_MS) {
        reportError(
          'Foto lama atau dari galeri tidak diperbolehkan. Silakan ambil foto selfie langsung menggunakan kamera saat ini.'
        );
        return;
      }
    }

    setVerifyingFace(true);
    try {
      const faceResult = await verifySelfieHasFace(file);
      if (!faceResult.valid) {
        reportError(
          faceResult.message ||
            'Wajah tidak terdeteksi pada foto. Pastikan wajah terlihat jelas dan tidak gelap.'
        );
        return;
      }

      const url = URL.createObjectURL(file);
      onCapture(file, url);
    } finally {
      setVerifyingFace(false);
    }
  };

  const startLiveCamera = async () => {
    setLocalError('');
    setAllowMobileFallback(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (isTouchDevice()) {
        setAllowMobileFallback(true);
        mobileInputRef.current?.click();
      } else {
        reportError(
          'Kamera langsung tidak tersedia pada browser ini. Gunakan browser dengan akses kamera aktif (HTTPS) — unggah dari galeri dinonaktifkan.'
        );
      }
      return;
    }

    setStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      if (isTouchDevice()) {
        setAllowMobileFallback(true);
        reportError(
          'Izin kamera browser ditolak. Anda dapat menggunakan kamera perangkat langsung (foto galeri tetap ditolak).'
        );
      } else {
        reportError(
          'Akses kamera ditolak atau tidak ditemukan. Harap izinkan kamera untuk mengambil selfie langsung.'
        );
      }
    } finally {
      setStartingCamera(false);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      reportError('Kamera belum siap. Tunggu sebentar lalu coba ambil foto lagi.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
    );
    if (!blob) {
      reportError('Gagal mengambil gambar dari kamera.');
      return;
    }

    stopCamera();
    const freshFile = new File([blob], `selfie-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    await processCandidateFile(freshFile, true);
  };

  const borderAccent =
    accent === 'red'
      ? 'border-red-400/50 hover:border-red-600 bg-red-50/40'
      : accent === 'primary'
        ? 'border-primary/40 hover:border-primary bg-slate-50'
        : 'border-emerald-500/40 hover:border-emerald-600 bg-emerald-50/40';

  const iconAccent =
    accent === 'red'
      ? 'text-red-600 border-red-200'
      : accent === 'primary'
        ? 'text-primary border-border-light'
        : 'text-emerald-600 border-emerald-200';

  if (previewUrl) {
    return (
      <div className="space-y-2.5 text-center">
        <div className="relative mx-auto inline-block">
          <img
            src={previewUrl}
            alt="Preview selfie langsung"
            className="h-44 w-44 rounded-2xl border-2 border-emerald-500 object-cover shadow-xs"
          />
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3" />
            Selfie Terverifikasi
          </span>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setLocalError('');
              onClear();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Ambil Ulang Selfie
          </button>
        </div>
      </div>
    );
  }

  if (cameraOpen) {
    return (
      <div className="mx-auto max-w-[320px] space-y-3">
        <div className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-950">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-[240px] w-full object-cover -scale-x-100"
          />
          <button
            type="button"
            aria-label="Tutup kamera"
            onClick={stopCamera}
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={verifyingFace}
          onClick={() => void captureFrame()}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
        >
          {verifyingFace ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memverifikasi Wajah...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              Ambil Foto Sekarang
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        disabled={startingCamera || verifyingFace}
        onClick={() => void startLiveCamera()}
        className={`flex flex-col items-center justify-center gap-2.5 w-full max-w-[280px] h-[180px] border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-150 mx-auto group ${borderAccent}`}
      >
        <div
          className={`w-12 h-12 rounded-full bg-white shadow-xs border flex items-center justify-center group-hover:scale-105 transition-transform ${iconAccent}`}
        >
          {startingCamera || verifyingFace ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera size={24} />
          )}
        </div>
        <div className="text-center px-3">
          <span className="text-xs text-text-primary font-bold block">
            {verifyingFace
              ? 'Memverifikasi wajah...'
              : startingCamera
                ? 'Membuka kamera...'
                : title}
          </span>
          <span className="text-[11px] text-text-muted mt-0.5 block">
            Kamera langsung wajib • Foto galeri ditolak
          </span>
        </div>
      </button>

      {/* Mobile-only capture="user" fallback when getUserMedia is unavailable */}
      {allowMobileFallback && (
        <div className="text-center">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Camera className="h-3.5 w-3.5" />
            Buka Kamera Perangkat
            <input
              ref={mobileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              disabled={verifyingFace}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void processCandidateFile(file, false);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>
      )}

      {localError && (
        <div className="mx-auto max-w-[320px] flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 text-left">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}
    </div>
  );
};
