import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  Check,
  RefreshCw,
  MapPin,
  Clock,
  AlertTriangle,
  Upload,
  User,
  ShieldCheck,
  SwitchCamera,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface CaptureWatermarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolName: string;
  actionLabel: string;
  locationName: string;
  onPhotoCaptured: (data: {
    file: File;
    previewUrl: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    capturedAt: string;
    isManualGpsOverride: boolean;
  }) => void;
}

export default function CaptureWatermarkModal({
  isOpen,
  onClose,
  toolName,
  actionLabel,
  locationName,
  onPhotoCaptured,
}: CaptureWatermarkModalProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  // Geolocation states
  const [gpsLoading, setGpsLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);

  const canOverrideGps = user?.role && ['owner', 'director', 'asset_admin'].includes(user.role);

  // Initialize GPS
  useEffect(() => {
    if (!isOpen) return;

    setGpsLoading(true);
    setGpsError(null);

    if (!('geolocation' in navigator)) {
      setGpsError('Browser tidak mendukung pendeteksian lokasi GPS');
      setGpsLoading(false);
      return;
    }

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setGpsLoading(false);
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        setGpsError('Gagal mendeteksi koordinat GPS. Pastikan izin lokasi aktif.');
        setGpsLoading(false);
      },
      geoOptions
    );
  }, [isOpen]);

  // Initialize Camera
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        'Kamera tidak dapat diakses atau izin ditolak. Anda dapat menggunakan tombol "Pilih File / Kamera Native" di bawah.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Stamp watermark onto canvas from video or image
  const stampWatermark = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timestampWIB: string
  ) => {
    // Watermark HUD Ribbon at bottom
    const ribbonHeight = Math.max(140, Math.round(height * 0.22));
    const ribbonY = height - ribbonHeight;

    // Dark semi-transparent gradient
    const gradient = ctx.createLinearGradient(0, ribbonY - 20, 0, height);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
    gradient.addColorStop(0.2, 'rgba(15, 23, 42, 0.85)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.96)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, ribbonY - 20, width, ribbonHeight + 20);

    // Cyan accent divider line
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(0, ribbonY - 2, width, 3);

    // Padding & Typography scale
    const paddingX = Math.round(width * 0.04);
    const fontSizeTitle = Math.max(14, Math.round(height * 0.024));
    const fontSizeBody = Math.max(11, Math.round(height * 0.018));
    const lineSpacing = Math.round(fontSizeBody * 1.45);

    let currentY = ribbonY + Math.round(ribbonHeight * 0.22);

    // Header badge
    ctx.fillStyle = '#38BDF8'; // Sky blue
    ctx.font = `bold ${fontSizeTitle}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('MTERP CONSTRUCTION ASSET AUDIT', paddingX, currentY);

    // Live Timestamp
    ctx.font = `600 ${fontSizeBody}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#F8FAFC'; // White
    const dateText = `WAKTU: ${timestampWIB}`;
    const textWidth = ctx.measureText(dateText).width;
    ctx.fillText(dateText, width - paddingX - textWidth, currentY);

    currentY += lineSpacing + 2;

    // Tool Name & Action
    ctx.fillStyle = '#E2E8F0';
    ctx.font = `bold ${fontSizeBody + 1}px "Segoe UI", Arial, sans-serif`;
    const displayTool = (toolName && toolName.trim()) ? toolName.trim().toUpperCase() : 'REGISTRASI ALAT BARU';
    ctx.fillText(`ALAT: ${displayTool}`, paddingX, currentY);

    // Action Tag on right
    ctx.fillStyle = '#F59E0B'; // Amber
    const displayAction = (actionLabel && actionLabel.trim()) ? actionLabel.trim().toUpperCase() : 'PENDAFTARAN';
    const actionText = `AKSI: ${displayAction}`;
    const actionTextWidth = ctx.measureText(actionText).width;
    ctx.fillText(actionText, width - paddingX - actionTextWidth, currentY);

    currentY += lineSpacing;

    // Location / Warehouse
    ctx.fillStyle = '#CBD5E1';
    ctx.font = `500 ${fontSizeBody}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(`LOKASI: ${locationName || 'Warehouse Utama'}`, paddingX, currentY);

    currentY += lineSpacing;

    // GPS Coordinates
    ctx.fillStyle = coords ? '#4ADE80' : manualOverride ? '#FBBF24' : '#F87171'; // Green / Yellow / Red
    let gpsText = '';
    if (coords) {
      gpsText = `GPS: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} (±${coords.accuracy}m)`;
    } else if (manualOverride) {
      gpsText = 'GPS: OVERRIDE MANUAL (DISETUJUI ASSET ADMIN)';
    } else {
      gpsText = 'GPS: TIDAK TERDETEKSI';
    }
    ctx.fillText(gpsText, paddingX, currentY);

    // Operator
    ctx.fillStyle = '#94A3B8';
    const operatorText = `OPERATOR: ${user?.fullName || user?.username || 'Petugas'} (${user?.role || 'Staff'})`;
    const opWidth = ctx.measureText(operatorText).width;
    ctx.fillText(operatorText, width - paddingX - opWidth, currentY);
  };

  const getWIBTimeString = () => {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()) + ' WIB';
  };

  // Capture from live video stream
  const captureFromVideo = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Stamp watermark
    const timeWIB = getWIBTimeString();
    stampWatermark(ctx, width, height, timeWIB);

    // Export blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          const previewUrl = URL.createObjectURL(blob);
          setCapturedPreview(previewUrl);
          stopCamera();
        }
      },
      'image/jpeg',
      0.88
    );
  };

  // Fallback: Stamp uploaded/chosen image file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = img.naturalWidth || 1280;
      const height = img.naturalHeight || 720;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, width, height);

      const timeWIB = getWIBTimeString();
      stampWatermark(ctx, width, height, timeWIB);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCapturedBlob(blob);
            const previewUrl = URL.createObjectURL(blob);
            setCapturedPreview(previewUrl);
            stopCamera();
          }
          URL.revokeObjectURL(objectUrl);
        },
        'image/jpeg',
        0.88
      );
    };
    img.src = objectUrl;
  };

  const handleRetake = () => {
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedBlob(null);
    setCapturedPreview(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (!capturedBlob || !capturedPreview) return;

    const fileName = `tool-evidence-${Date.now()}.jpg`;
    const file = new File([capturedBlob], fileName, { type: 'image/jpeg' });

    onPhotoCaptured({
      file,
      previewUrl: capturedPreview,
      lat: coords?.lat || null,
      lng: coords?.lng || null,
      accuracy: coords?.accuracy || null,
      capturedAt: new Date().toISOString(),
      isManualGpsOverride: manualOverride,
    });

    onClose();
  };

  if (!isOpen) return null;

  const isGpsValid = !!coords || manualOverride;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-[fade-in_0.2s_ease_both]">
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Kamera Bukti Fisik & Watermark ERP
              </h3>
              <p className="text-[11px] text-slate-400">
                Foto wajib dilengkapi koordinat GPS dan cap waktu digital
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Context Strip */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-800/60 border-b border-slate-700/60 text-xs shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Alat:</span>
            <span className="text-cyan-300 font-bold truncate max-w-[200px]">{toolName}</span>
            <span className="text-slate-500">•</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {actionLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin size={13} className={coords ? 'text-emerald-400' : 'text-rose-400'} />
            {gpsLoading ? (
              <span className="text-slate-400 animate-pulse text-[11px]">Mencari sinyal GPS...</span>
            ) : coords ? (
              <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (±{coords.accuracy}m)
              </span>
            ) : manualOverride ? (
              <span className="text-amber-400 font-semibold text-[11px]">Override Manual Disetujui</span>
            ) : (
              <span className="text-rose-400 font-semibold text-[11px]">GPS Tidak Terdeteksi</span>
            )}
          </div>
        </div>

        {/* Main Viewport */}
        <div className="relative flex-1 bg-black min-h-[340px] flex items-center justify-center overflow-hidden">
          {capturedPreview ? (
            /* Snapshot Preview */
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={capturedPreview}
                alt="Captured Watermarked Evidence"
                className="max-h-[60vh] max-w-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1.5 shadow-lg">
                <ShieldCheck size={14} />
                <span>Watermark Digital Terverifikasi</span>
              </div>
            </div>
          ) : (
            /* Live Camera Stream */
            <div className="relative w-full h-full flex items-center justify-center">
              {cameraError ? (
                <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
                  <AlertTriangle size={36} className="text-amber-400 mb-2" />
                  <p className="text-xs text-slate-300 mb-4">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all"
                  >
                    <Upload size={15} />
                    <span>Pilih File Gambar / Kamera Native</span>
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover max-h-[60vh]"
                  />

                  {/* Camera overlay HUD elements */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/90 transition-all border border-white/20 shadow-lg cursor-pointer"
                      title="Ganti Kamera (Depan / Belakang)"
                    >
                      <SwitchCamera size={16} />
                    </button>
                  </div>

                  {/* Watermark preview simulation on camera */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent p-3 pt-8 text-[11px] text-slate-200 pointer-events-none">
                    <div className="flex items-center justify-between text-cyan-400 font-bold text-xs mb-0.5">
                      <span>MTERP ASSET AUDIT</span>
                      <span className="text-white text-[10px] font-mono">{getWIBTimeString()}</span>
                    </div>
                    <div className="text-slate-300 truncate">
                      <span className="font-semibold text-white">{toolName}</span> • {locationName}
                    </div>
                    <div className="font-mono text-[10px] text-emerald-400 mt-0.5">
                      {coords
                        ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                        : manualOverride
                        ? 'GPS: OVERRIDE MANUAL'
                        : 'GPS: Menunggu sinyal...'}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Hidden Canvas for Processing */}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* GPS Warning & Manual Override Bar */}
        {!coords && !gpsLoading && (
          <div className="px-4 py-2.5 bg-rose-950/40 border-t border-rose-900/50 flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle size={15} className="shrink-0 text-rose-400" />
              <span>Lokasi GPS belum tersedia. Nyalakan GPS perangkat Anda.</span>
            </div>
            {canOverrideGps && (
              <label className="flex items-center gap-2 text-amber-300 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={manualOverride}
                  onChange={(e) => setManualOverride(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-[11px]">Override GPS (Asset Admin)</span>
              </label>
            )}
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/90 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {!capturedPreview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
              >
                <Upload size={14} />
                <span>Upload File</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {capturedPreview ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                >
                  <RefreshCw size={14} />
                  <span>Ulangi Foto</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isGpsValid}
                  className="flex items-center gap-1.5 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Check size={15} />
                  <span>Gunakan Foto Ini</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={captureFromVideo}
                disabled={cameraError !== null}
                className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Camera size={16} />
                <span>Ambil Foto</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
