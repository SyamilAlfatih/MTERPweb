import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, Trash2, CheckCircle2, PenTool } from 'lucide-react';

export interface SignaturePadProps {
  label: string;
  required?: boolean;
  signerName?: string;
  signerRole?: string;
  height?: number;
  initialSignature?: string | null;
  onSave: (dataUrl: string | null) => void;
  onClear?: () => void;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

export default function SignaturePad({
  label,
  required = false,
  signerName,
  signerRole,
  height = 140,
  initialSignature,
  onSave,
  onClear,
  className = '',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  // Redraw all strokes onto canvas with smooth lines
  const redraw = useCallback((allStrokes: Point[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (allStrokes.length === 0) {
      setHasSignature(false);
      onSave(null);
      return;
    }

    ctx.strokeStyle = '#0F172A'; // Slate 900 ink
    ctx.lineWidth = 2.2 * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of allStrokes) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);

      for (let i = 1; i < stroke.length - 1; i++) {
        const xc = (stroke[i].x + stroke[i + 1].x) / 2;
        const yc = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
      }

      const lastIdx = stroke.length - 1;
      ctx.lineTo(stroke[lastIdx].x, stroke[lastIdx].y);
      ctx.stroke();
    }

    setHasSignature(true);
    onSave(canvas.toDataURL('image/png'));
  }, [onSave]);

  // Handle Canvas Resizing for High-DPI screens
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    redraw(strokes);
  }, [height, redraw, strokes]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Load initial signature if provided
  useEffect(() => {
    if (initialSignature && !hasSignature && strokes.length === 0) {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasSignature(true);
        onSave(initialSignature);
      };
      img.src = initialSignature;
    }
  }, [initialSignature, hasSignature, strokes.length, onSave]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const pt = getCanvasPoint(e);
    currentStrokeRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getCanvasPoint(e);
    currentStrokeRef.current.push(pt);
    redraw([...strokes, currentStrokeRef.current]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
    if (currentStrokeRef.current.length > 0) {
      const nextStrokes = [...strokes, currentStrokeRef.current];
      setStrokes(nextStrokes);
      redraw(nextStrokes);
    }
    currentStrokeRef.current = [];
  };

  const handleClear = () => {
    setStrokes([]);
    currentStrokeRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
    onSave(null);
    onClear?.();
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const nextStrokes = strokes.slice(0, -1);
    setStrokes(nextStrokes);
    redraw(nextStrokes);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <label className="font-bold text-slate-800 flex items-center gap-1.5">
          <PenTool size={14} className="text-teal-600" />
          <span>{label}</span>
          {required && <span className="text-rose-500 font-bold">*</span>}
        </label>
        {hasSignature && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={12} />
            <span>Tanda tangan terekam</span>
          </span>
        )}
      </div>

      {/* Canvas Box */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl border-2 border-slate-300 bg-white overflow-hidden shadow-2xs hover:border-slate-400 focus-within:border-teal-500 transition-colors"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-full cursor-crosshair touch-none select-none block"
        />

        {/* Subtle Baseline for Signing */}
        <div className="absolute left-6 right-6 bottom-7 pointer-events-none border-b border-dashed border-slate-200 flex items-end justify-between pb-0.5">
          <span className="text-[10px] text-slate-400 select-none">
            {signerName ? `Tanda tangan di sini: ${signerName}` : 'Tanda tangan di atas garis ini'}
          </span>
          {signerRole && (
            <span className="text-[9px] uppercase tracking-wider text-slate-300 font-medium select-none">
              {signerRole}
            </span>
          )}
        </div>

        {/* Clear & Undo Buttons */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {strokes.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              title="Undo goresan terakhir"
              className="p-1.5 rounded-lg bg-slate-100/90 hover:bg-slate-200 text-slate-600 text-xs transition-colors cursor-pointer border border-slate-200"
            >
              <RotateCcw size={13} />
            </button>
          )}
          {hasSignature && (
            <button
              type="button"
              onClick={handleClear}
              title="Hapus tanda tangan"
              className="p-1.5 rounded-lg bg-rose-50/90 hover:bg-rose-100 text-rose-600 text-xs transition-colors cursor-pointer border border-rose-200"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
