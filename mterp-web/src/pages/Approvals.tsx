import { useState, useEffect } from 'react';
import { Check, X, Inbox, AlertCircle, DollarSign, Shield, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState } from '../components/shared';
import { ApprovalItem, KasbonItem } from '../types';
import { formatDate as formatWIBDate } from '../utils/date';

export default function Approvals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [kasbons, setKasbons] = useState<KasbonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Passphrase confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: 'request' | 'kasbon';
    id: string;
  }>({ open: false, type: 'request', id: '' });
  const [passphrase, setPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const isDirectorOrOwner = user?.role === 'director' || user?.role === 'owner';

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      setError(null);
      const [requestsRes, ...kasbonRes] = await Promise.all([
        api.get('/requests?status=Pending'),
        ...(isDirectorOrOwner ? [api.get('/kasbon?status=Pending')] : []),
      ]);

      // Map material requests
      const mapped = requestsRes.data.map((r: any) => ({
        id: r._id,
        requester: r.requestedBy?.fullName || r.requestedBy || 'Unknown',
        role: r.requestedBy?.role || 'Staff',
        item: r.item,
        qty: r.qty,
        urgency: r.urgency || 'Normal',
        date: r.dateNeeded ? formatWIBDate(r.dateNeeded, { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
        project: r.projectId?.nama || 'General',
      }));
      setApprovals(mapped);

      // Map kasbon requests (director/owner only)
      if (isDirectorOrOwner && kasbonRes[0]) {
        const kasbonMapped = kasbonRes[0].data.map((k: any) => ({
          id: k._id,
          requester: k.userId?.fullName || 'Unknown',
          role: k.userId?.role || 'Staff',
          amount: k.amount,
          reason: k.reason || '-',
          date: formatWIBDate(k.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
        }));
        setKasbons(kasbonMapped);
      }
    } catch (err: any) {
      console.error('Failed to fetch approvals', err);
      setError(err.response?.data?.msg || t('approvals.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Open confirmation modal for approvals
  const openConfirmApprove = (id: string, type: 'request' | 'kasbon') => {
    setConfirmModal({ open: true, type, id });
    setPassphrase('');
    setPassphraseError('');
  };

  const closeConfirmModal = () => {
    setConfirmModal({ open: false, type: 'request', id: '' });
    setPassphrase('');
    setPassphraseError('');
  };

  // Confirm approval with passphrase
  const handleConfirmApprove = async () => {
    if (passphrase.length < 4) return;
    setConfirming(true);
    setPassphraseError('');
    try {
      const { type, id } = confirmModal;
      if (type === 'request') {
        await api.put(`/requests/${id}`, {
          status: 'Approved',
          passphrase,
        });
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } else {
        await api.put(`/kasbon/${id}`, {
          status: 'Approved',
          passphrase,
        });
        setKasbons((prev) => prev.filter((k) => k.id !== id));
      }
      closeConfirmModal();
    } catch (err: any) {
      const msg = err?.response?.data?.msg || t('approvals.messages.approveFailed');
      setPassphraseError(msg);
    } finally {
      setConfirming(false);
    }
  };

  // Reject without passphrase
  const handleReject = async (id: string, type: 'request' | 'kasbon') => {
    setProcessing(id);
    try {
      if (type === 'request') {
        await api.put(`/requests/${id}`, { status: 'Rejected' });
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } else {
        await api.put(`/kasbon/${id}`, { status: 'Rejected' });
        setKasbons((prev) => prev.filter((k) => k.id !== id));
      }
    } catch (err) {
      console.error('Failed to reject', err);
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'High':
        return <Badge label={t('approvals.materialRequests.urgency.urgent')} variant="danger" />;
      case 'Low':
        return <Badge label={t('approvals.materialRequests.urgency.low')} variant="neutral" />;
      default:
        return <Badge label={t('approvals.materialRequests.urgency.normal')} variant="primary" />;
    }
  };

  const totalItems = approvals.length + kasbons.length;

  return (
    <div className="p-6 max-w-[900px] min-h-[400px] max-lg:p-4 max-sm:p-3 mx-auto">
      {/* Header - always shown */}
      <div className="flex justify-between items-center mb-6 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{t('approvals.title')}</h1>
        <Badge label={t('approvals.itemsCount', { count: totalItems })} variant="warning" size="medium" />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-text-muted">
          <div className="spinner"></div>
          <span>{t('approvals.loading')}</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <EmptyState
          icon={AlertCircle}
          title={t('approvals.errorLoading')}
          description={error}
        />
      )}

      {/* Empty State */}
      {!loading && !error && totalItems === 0 && (
        <EmptyState
          icon={Inbox}
          title={t('approvals.empty.title')}
          description={t('approvals.empty.desc')}
        />
      )}

      {/* Material Request Approvals */}
      {!loading && !error && approvals.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider m-0 mb-3">{t('approvals.materialRequests.title')}</h2>
          <div className="flex flex-col gap-4">
            {approvals.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex justify-between items-start mb-4 max-sm:flex-col max-sm:gap-2">
                  <div>
                    <h3 className="text-base font-bold text-text-primary m-0">{item.requester}</h3>
                    <span className="text-sm text-text-muted">{item.role}</span>
                  </div>
                  {getUrgencyBadge(item.urgency)}
                </div>

                <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-border-light">
                  <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                    <span className="text-sm text-text-muted font-medium">{t('approvals.materialRequests.item')}</span>
                    <span className="text-sm text-text-primary font-semibold">{item.item}</span>
                  </div>
                  <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                    <span className="text-sm text-text-muted font-medium">{t('approvals.materialRequests.qty')}</span>
                    <span className="text-sm text-text-primary font-semibold">{item.qty}</span>
                  </div>
                  <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                    <span className="text-sm text-text-muted font-medium">{t('approvals.materialRequests.dateNeeded')}</span>
                    <span className="text-sm text-text-primary font-semibold">{item.date}</span>
                  </div>
                  <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                    <span className="text-sm text-text-muted font-medium">{t('approvals.materialRequests.project')}</span>
                    <span className="text-sm text-text-primary font-semibold">{item.project}</span>
                  </div>
                </div>

                <div className="flex gap-3 justify-end max-sm:flex-col [&>button]:max-sm:w-full">
                  <Button
                    title={t('approvals.actions.reject')}
                    icon={X}
                    onClick={() => handleReject(item.id, 'request')}
                    variant="danger"
                    size="small"
                    loading={processing === item.id}
                  />
                  <Button
                    title={t('approvals.actions.approve')}
                    icon={Check}
                    onClick={() => openConfirmApprove(item.id, 'request')}
                    variant="success"
                    size="small"
                    loading={processing === item.id}
                  />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Kasbon Approvals - Director/Owner Only */}
      {!loading && !error && isDirectorOrOwner && (
        <>
          <h2 className="text-sm font-bold text-warning uppercase tracking-wider m-0 mb-3 flex items-center gap-2 mt-8 pt-6 border-t border-border-light max-sm:mt-6 max-sm:pt-4">
            <DollarSign size={20} />
            {t('approvals.kasbon.title')}
            {kasbons.length > 0 && (
              <Badge label={`${kasbons.length}`} variant="warning" size="small" />
            )}
          </h2>

          {kasbons.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-text-muted text-sm m-0">{t('approvals.kasbon.empty')}</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {kasbons.map((item) => (
                <Card key={item.id} className="p-5 border-l-4 border-l-warning">
                  <div className="flex justify-between items-start mb-4 max-sm:flex-col max-sm:gap-2">
                    <div>
                      <h3 className="text-base font-bold text-text-primary m-0">{item.requester}</h3>
                      <span className="text-sm text-text-muted">{item.role}</span>
                    </div>
                    <Badge label={t('approvals.kasbon.badge')} variant="warning" />
                  </div>

                  <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-border-light">
                    <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                      <span className="text-sm text-text-muted font-medium">{t('approvals.kasbon.amount')}</span>
                      <span className="text-base font-bold text-warning">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                      <span className="text-sm text-text-muted font-medium">{t('approvals.kasbon.reason')}</span>
                      <span className="text-sm text-text-primary font-semibold">{item.reason}</span>
                    </div>
                    <div className="flex justify-between max-sm:flex-col max-sm:gap-1">
                      <span className="text-sm text-text-muted font-medium">{t('approvals.kasbon.requested')}</span>
                      <span className="text-sm text-text-primary font-semibold">{item.date}</span>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end max-sm:flex-col [&>button]:max-sm:w-full">
                    <Button
                      title={t('approvals.actions.reject')}
                      icon={X}
                      onClick={() => handleReject(item.id, 'kasbon')}
                      variant="danger"
                      size="small"
                      loading={processing === item.id}
                    />
                    <Button
                      title={t('approvals.actions.approve')}
                      icon={Check}
                      onClick={() => openConfirmApprove(item.id, 'kasbon')}
                      variant="success"
                      size="small"
                      loading={processing === item.id}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Passphrase Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-5" onClick={closeConfirmModal}>
          <div className="bg-bg-white rounded-2xl max-w-[400px] w-full shadow-[0_20px_60px_rgba(0,0,0,0.18)] animate-[fade-in-up_0.25s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="py-8 px-6 text-center flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#312E59] to-indigo-600 text-white flex items-center justify-center shadow-[0_6px_20px_rgba(49,46,89,0.3)] mb-1">
                <Lock size={28} />
              </div>
              <h3 className="text-[1.15rem] font-bold text-text-primary m-0">{t('approvals.confirmModal.title')}</h3>
              <p className="text-[0.85rem] text-text-muted m-0 leading-relaxed max-w-[280px]">{t('approvals.confirmModal.desc')}</p>

              <div className="relative w-full mt-1">
                <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  className={`w-full py-3.5 pl-10 pr-3.5 border-2 border-border rounded-xl text-base text-center text-text-primary bg-bg-secondary outline-none transition-colors tracking-[3px] focus:border-[#312E59] focus:bg-white ${passphraseError ? '!border-red-500 !shadow-[0_0_0_3px_rgba(239,68,68,0.1)]' : ''}`}
                  value={passphrase}
                  onChange={(e) => { setPassphrase(e.target.value); setPassphraseError(''); }}
                  placeholder={t('approvals.confirmModal.placeholder')}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && passphrase.length >= 4) handleConfirmApprove(); }}
                />
              </div>
              {passphraseError && <p className="text-red-500 text-[0.8rem] m-0 font-medium">{passphraseError}</p>}

              <div className="flex gap-3 w-full mt-1">
                <button className="flex-1 p-3 border border-border bg-bg-white rounded-lg text-[0.9rem] font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary" onClick={closeConfirmModal}>
                  {t('approvals.confirmModal.btnCancel')}
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 p-3 border-none rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-400 text-white text-[0.9rem] font-bold cursor-pointer shadow-[0_3px_12px_rgba(5,150,105,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_16px_rgba(5,150,105,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirmApprove}
                  disabled={passphrase.length < 4 || confirming}
                >
                  {confirming ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> {t('approvals.confirmModal.btnApproving')}</>
                  ) : (
                    <><Check size={16} /> {t('approvals.confirmModal.btnApprove')}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
