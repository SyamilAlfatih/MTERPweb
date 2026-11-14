import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck, XCircle, AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '../shared';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { UnifiedApprovalRecord } from '../../utils/approvalWorkflow';

const QUICK_REJECTION_REASONS = [
  'Anggaran melebihi pagu proyek',
  'Spesifikasi / detail item belum lengkap',
  'Dokumen pendukung / lampiran kurang',
  'Jadwal kebutuhan belum mendesak',
  'Duplikasi pengajuan sebelumnya',
];

interface ApproveConfirmModalProps {
  open: boolean;
  items: UnifiedApprovalRecord[];
  sessionUnlocked: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    passphrase: string;
    notes: string;
    unlockSession: boolean;
  }) => Promise<void>;
  errorMsg: string;
  submitting: boolean;
}

export const ApproveConfirmModal: React.FC<ApproveConfirmModalProps> = ({
  open,
  items,
  sessionUnlocked,
  onClose,
  onSubmit,
  errorMsg,
  submitting,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [notes, setNotes] = useState('');
  const [unlockSession, setUnlockSession] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, {
    isActive: open,
    onEscape: onClose,
  });

  useEffect(() => {
    if (open) {
      setPassphrase('');
      setNotes('');
      setUnlockSession(false);
    }
  }, [open]);

  if (!open || items.length === 0) return null;

  const isBatch = items.length > 1;
  const needsPassphraseInput = !sessionUnlocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsPassphraseInput && passphrase.length < 4) return;
    await onSubmit({ passphrase, notes, unlockSession });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            {sessionUnlocked ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <h2 id="approve-modal-title" className="text-base font-bold text-slate-900">
              {isBatch ? `Setujui ${items.length} Pengajuan` : 'Konfirmasi Persetujuan'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isBatch
                ? 'Setiap pengajuan akan diproses sesuai tahap otorisasi masing-masing.'
                : `${items[0].title} • ${items[0].stageLabel}`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {isBatch && (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
              {items.map((it) => (
                <div key={it.uid} className="flex items-center justify-between text-xs text-slate-700">
                  <span className="truncate font-medium pr-2">{it.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{it.stageLabel}</span>
                </div>
              ))}
            </div>
          )}

          {sessionUnlocked ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              Sesi otorisasi sedang aktif. Anda dapat langsung menyetujui tanpa mengetik ulang kata sandi.
            </div>
          ) : (
            <div>
              <label
                htmlFor="approve-passphrase"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Kata Sandi / Passphrase Otorisasi
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="approve-passphrase"
                  type="password"
                  autoFocus
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Masukkan kata sandi akun Anda"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={unlockSession}
                  onChange={(e) => setUnlockSession(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Ingat otorisasi di sesi ini selama 10 menit (untuk approval cepat)</span>
              </label>
            </div>
          )}

          <div>
            <label
              htmlFor="approve-notes"
              className="mb-1.5 block text-xs font-semibold text-slate-700"
            >
              Catatan Otorisasi (Opsional)
            </label>
            <input
              id="approve-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Sesuai budget RAB tahap 2"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              title="Batal"
              onClick={onClose}
              disabled={submitting}
            />
            <Button
              type="submit"
              variant="primary"
              title={
                submitting
                  ? 'Memproses...'
                  : isBatch
                    ? `Setujui ${items.length} Item`
                    : 'Setujui Pengajuan'
              }
              loading={submitting}
              disabled={submitting || (needsPassphraseInput && passphrase.length < 4)}
            />
          </div>
        </form>
      </div>
    </div>
  );
};

interface RejectReasonModalProps {
  open: boolean;
  item: UnifiedApprovalRecord | null;
  sessionUnlocked: boolean;
  onClose: () => void;
  onSubmit: (payload: { reason: string; passphrase: string }) => Promise<void>;
  errorMsg: string;
  submitting: boolean;
}

export const RejectReasonModal: React.FC<RejectReasonModalProps> = ({
  open,
  item,
  sessionUnlocked,
  onClose,
  onSubmit,
  errorMsg,
  submitting,
}) => {
  const [reason, setReason] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, {
    isActive: open,
    onEscape: onClose,
  });

  useEffect(() => {
    if (open) {
      setReason('');
      setPassphrase('');
    }
  }, [open]);

  if (!open || !item) return null;

  const needsPassphrase = item.requiresPassphraseOnReject && !sessionUnlocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    if (needsPassphrase && passphrase.length < 4) return;
    await onSubmit({ reason: reason.trim(), passphrase });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="reject-modal-title" className="text-base font-bold text-slate-900">
              Tolak Pengajuan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.title} • oleh {item.requester}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">
              Pilih Alasan Cepat
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REJECTION_REASONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    reason === chip
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="reject-reason-input"
              className="mb-1.5 block text-xs font-semibold text-slate-700"
            >
              Alasan Penolakan <span className="text-red-600">*</span>
            </label>
            <textarea
              id="reject-reason-input"
              rows={3}
              required
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan penolakan agar pemohon dapat menindaklanjuti..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none"
            />
          </div>

          {needsPassphrase && (
            <div>
              <label
                htmlFor="reject-passphrase"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Kata Sandi Otorisasi
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="reject-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Masukkan kata sandi akun Anda"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              title="Batal"
              onClick={onClose}
              disabled={submitting}
            />
            <Button
              type="submit"
              variant="danger"
              title={submitting ? 'Menolak...' : 'Konfirmasi Tolak'}
              loading={submitting}
              disabled={submitting || !reason.trim() || (needsPassphrase && passphrase.length < 4)}
            />
          </div>
        </form>
      </div>
    </div>
  );
};
