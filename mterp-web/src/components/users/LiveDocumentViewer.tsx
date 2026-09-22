import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ExternalLink, 
  GraduationCap, 
  Award, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Building2, 
  FileCheck,
  Loader2,
  AlertCircle
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getImageUrl } from '../../utils/image';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ViewerDocument {
  id: string;
  title: string;
  type: 'education' | 'competency';
  documentUrl: string;
  documentName?: string;
  documentSize?: number;
  uploadedAt?: string;
  issuer?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  level?: string;
  major?: string;
  graduationYear?: string;
}

interface LiveDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documents: ViewerDocument[];
  initialIndex?: number;
  userName?: string;
}

export const LiveDocumentViewer: React.FC<LiveDocumentViewerProps> = ({
  isOpen,
  onClose,
  documents,
  initialIndex = 0,
  userName = 'Pekerja'
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // PDF Rendering States
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState(1);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Sync state if initialIndex changes when opening modal
  if (initialIndex !== prevInitialIndex) {
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(initialIndex);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setPdfCurrentPage(1);
  }

  const selectDocument = (idx: number) => {
    setCurrentIndex(idx);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setPdfCurrentPage(1);
  };

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && documents.length > 1) {
        selectDocument((currentIndex + 1) % documents.length);
      } else if (e.key === 'ArrowLeft' && documents.length > 1) {
        selectDocument((currentIndex - 1 + documents.length) % documents.length);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + 0.25, 4));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(z - 0.25, 0.5));
      } else if (e.key === 'r' || e.key === 'R') {
        setRotation((r) => (r + 90) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, documents.length, onClose, currentIndex]);

  const currentDoc = documents[currentIndex] || documents[0];
  const resolvedUrl = currentDoc ? getImageUrl(currentDoc.documentUrl) : '';
  const isPdf = Boolean(
    currentDoc?.documentUrl?.toLowerCase().endsWith('.pdf') ||
    currentDoc?.documentName?.toLowerCase().endsWith('.pdf')
  );

  // Fetch and load PDF document into memory via fetch API (bypasses browser PDF auto-download)
  useEffect(() => {
    if (!isOpen || !isPdf || !resolvedUrl) {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
      return;
    }

    let isMounted = true;
    setPdfLoading(true);
    setPdfError(null);
    setPdfCurrentPage(1);

    const loadPdf = async () => {
      try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Gagal mengunduh berkas`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (!isMounted) return;

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        pdfDocRef.current = doc;
        setPdfNumPages(doc.numPages);
        setPdfLoading(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Gagal memproses berkas PDF';
        setPdfError(msg);
        setPdfLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [isOpen, isPdf, resolvedUrl]);

  // Render current PDF page onto canvas
  useEffect(() => {
    if (!isOpen || !isPdf || pdfLoading || !pdfDocRef.current || !canvasRef.current) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        const doc = pdfDocRef.current;
        if (!doc) return;

        const page = await doc.getPage(pdfCurrentPage);
        if (!isMounted) return;

        // Base scale 1.4 for crisp reading, multiplied by current user zoom
        const viewport = page.getViewport({ scale: zoom * 1.4, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.scale(dpr, dpr);

        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        await renderTaskRef.current.promise;
      } catch (err: unknown) {
        const maybeError = err as { name?: string };
        if (maybeError?.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page:', err);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [isOpen, isPdf, pdfLoading, pdfCurrentPage, zoom, rotation, currentDoc]);

  if (!isOpen || documents.length === 0 || !currentDoc) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'expired', label: 'Kedaluwarsa', bg: 'bg-red-500/20 text-red-400 border-red-500/30' };
    }
    if (diffDays <= 60) {
      return { status: 'expiring', label: `Berakhir dlm ${diffDays} hari`, bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    }
    return { status: 'valid', label: 'Sertifikat Aktif', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  };

  const expiryBadge = currentDoc.type === 'competency' ? getExpiryStatus(currentDoc.expiryDate) : null;

  // Mouse drag handlers for both image and canvas panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[2000] bg-slate-950/95 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200"
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900/90 border-b border-slate-800 shrink-0 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            {currentDoc.type === 'education' ? <GraduationCap size={22} /> : <Award size={22} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white m-0 tracking-tight flex items-center gap-2">
                <span>{currentDoc.title}</span>
                {expiryBadge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${expiryBadge.bg}`}>
                    {expiryBadge.label}
                  </span>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mt-0.5">
              <span className="font-bold text-slate-200">{userName}</span>
              <span>•</span>
              <span className="text-slate-300 font-semibold">{isPdf ? 'Dokumen PDF (Live Canvas)' : 'Berkas Gambar'}</span>
              {currentDoc.documentSize ? (
                <>
                  <span>•</span>
                  <span>{formatFileSize(currentDoc.documentSize)}</span>
                </>
              ) : null}
              {currentDoc.uploadedAt && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(currentDoc.uploadedAt).toLocaleDateString('id-ID')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls & Close */}
        <div className="flex items-center gap-2">
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-all border border-slate-700"
            title="Buka di tab baru"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Tab Baru</span>
          </a>

          <a
            href={resolvedUrl}
            download={currentDoc.documentName || 'dokumen'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary hover:text-primary-light text-xs font-bold transition-all border border-primary/40"
            title="Unduh berkas"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Unduh</span>
          </a>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 flex items-center justify-center transition-all cursor-pointer border border-slate-700 hover:border-red-500/40 ml-2"
            title="Tutup (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Multi-Document Navigation Tabs (If user has multiple certificates / education proof) */}
      {documents.length > 1 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-slate-900/60 border-b border-slate-800/80 overflow-x-auto shrink-0 scrollbar-thin">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 shrink-0 mr-1">
            Daftar Dokumen ({documents.length}):
          </span>
          {documents.map((doc, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={doc.id || idx}
                onClick={() => selectDocument(idx)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                  isActive
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
                }`}
              >
                {doc.type === 'education' ? <GraduationCap size={14} /> : <Award size={14} />}
                <span className="truncate max-w-[160px]">{doc.title}</span>
                {doc.type === 'competency' && doc.expiryDate && (
                  <span className={`w-2 h-2 rounded-full ${
                    new Date(doc.expiryDate) < new Date() ? 'bg-red-500' : 'bg-emerald-400'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Viewer Body */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-slate-950"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        {/* Next / Previous Document Nav Arrows */}
        {documents.length > 1 && (
          <>
            <button
              onClick={() => selectDocument((currentIndex - 1 + documents.length) % documents.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-slate-700 transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-sm"
              title="Dokumen Sebelumnya (Panah Kiri)"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={() => selectDocument((currentIndex + 1) % documents.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-slate-700 transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-sm"
              title="Dokumen Berikutnya (Panah Kanan)"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Content View: PDF Canvas vs Image */}
        {isPdf ? (
          <div className="flex items-center justify-center w-full h-full relative">
            {pdfLoading && (
              <div className="flex flex-col items-center gap-3 text-slate-300">
                <Loader2 size={36} className="text-primary animate-spin" />
                <span className="text-xs font-bold tracking-wide">Memuat pratinjau dokumen PDF...</span>
              </div>
            )}

            {pdfError && (
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-900/90 border border-slate-800 text-center max-w-md">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
                  <AlertCircle size={28} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Gagal Menampilkan Pratinjau PDF</h3>
                  <p className="text-xs text-slate-400">{pdfError}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5"
                  >
                    <ExternalLink size={14} /> Buka Tab Baru
                  </a>
                  <a
                    href={resolvedUrl}
                    download={currentDoc.documentName || 'dokumen.pdf'}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Download size={14} /> Unduh Berkas
                  </a>
                </div>
              </div>
            )}

            {!pdfLoading && !pdfError && (
              <div 
                className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-75 overflow-auto"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                }}
              >
                <div className="relative shadow-2xl rounded-lg overflow-hidden bg-white max-h-[82vh] max-w-[85vw] flex items-center justify-center">
                  <canvas ref={canvasRef} className="block select-none max-h-[82vh] max-w-[85vw] object-contain" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div 
            className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <img
              src={resolvedUrl}
              alt={currentDoc.title}
              className="max-h-[82vh] max-w-[85vw] object-contain rounded-xl shadow-2xl transition-transform duration-150 select-none pointer-events-none"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
              draggable={false}
            />
          </div>
        )}

        {/* Floating Controls Bar (Zoom, Rotate, Reset, and PDF Pagination) */}
        {(!isPdf || (!pdfLoading && !pdfError)) && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md text-white">
            {/* PDF Page Navigation */}
            {isPdf && pdfNumPages > 1 && (
              <>
                <div className="flex items-center gap-1 px-1">
                  <button
                    onClick={() => setPdfCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={pdfCurrentPage <= 1}
                    className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Halaman Sebelumnya"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-bold text-slate-300 px-1 whitespace-nowrap">
                    Hal {pdfCurrentPage} / {pdfNumPages}
                  </span>
                  <button
                    onClick={() => setPdfCurrentPage((p) => Math.min(p + 1, pdfNumPages))}
                    disabled={pdfCurrentPage >= pdfNumPages}
                    className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Halaman Berikutnya"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="w-[1px] h-5 bg-slate-700 mx-1" />
              </>
            )}

            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Perkecil (-)"
            >
              <ZoomOut size={18} />
            </button>

            <span className="text-xs font-black text-slate-200 min-w-[48px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Perbesar (+)"
            >
              <ZoomIn size={18} />
            </button>

            <div className="w-[1px] h-5 bg-slate-700 mx-1" />

            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
              title="Putar 90 Derajat (R)"
            >
              <RotateCw size={18} />
              <span>90°</span>
            </button>

            <div className="w-[1px] h-5 bg-slate-700 mx-1" />

            <button
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setPan({ x: 0, y: 0 });
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Reset Tampilan"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Bottom Metadata Summary Drawer / Footer */}
      <div className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 shrink-0 text-slate-300 text-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          {currentDoc.type === 'education' ? (
            <>
              {currentDoc.level && (
                <div className="flex items-center gap-1.5">
                  <GraduationCap size={15} className="text-primary" />
                  <span className="text-slate-400">Jenjang:</span>
                  <span className="font-bold text-white uppercase">{currentDoc.level}</span>
                </div>
              )}
              {currentDoc.major && (
                <div className="flex items-center gap-1.5">
                  <Building2 size={15} className="text-primary" />
                  <span className="text-slate-400">Jurusan:</span>
                  <span className="font-bold text-white">{currentDoc.major}</span>
                </div>
              )}
              {currentDoc.issuer && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Institusi:</span>
                  <span className="font-bold text-white">{currentDoc.issuer}</span>
                </div>
              )}
              {currentDoc.graduationYear && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Tahun Lulus:</span>
                  <span className="font-bold text-white">{currentDoc.graduationYear}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {currentDoc.certificateNumber && (
                <div className="flex items-center gap-1.5">
                  <FileCheck size={15} className="text-primary" />
                  <span className="text-slate-400">No. Sertifikat:</span>
                  <span className="font-bold text-white font-mono">{currentDoc.certificateNumber}</span>
                </div>
              )}
              {currentDoc.issuer && (
                <div className="flex items-center gap-1.5">
                  <Award size={15} className="text-primary" />
                  <span className="text-slate-400">Lembaga Penerbit:</span>
                  <span className="font-bold text-white">{currentDoc.issuer}</span>
                </div>
              )}
              {currentDoc.issueDate && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Tgl Terbit:</span>
                  <span className="font-bold text-white">{new Date(currentDoc.issueDate).toLocaleDateString('id-ID')}</span>
                </div>
              )}
              {currentDoc.expiryDate && (
                <div className="flex items-center gap-1.5">
                  <Clock size={15} className="text-slate-400" />
                  <span className="text-slate-400">Kedaluwarsa:</span>
                  <span className="font-bold text-white">{new Date(currentDoc.expiryDate).toLocaleDateString('id-ID')}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Gunakan <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 font-mono">Esc</kbd> untuk menutup, <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 font-mono">→</kbd> pindah dokumen
        </div>
      </div>
    </div>
  );
};

export default LiveDocumentViewer;
