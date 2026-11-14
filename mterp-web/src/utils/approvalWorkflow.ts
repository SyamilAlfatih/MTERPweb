import api from '../api/api';
import {
  reviewMaterialRequest,
  opsApproveMaterialRequest,
  financeApproveMaterialRequest,
} from '../api/scm.api';

export type ApprovalModule = 'request' | 'spkl' | 'kasbon';

export interface PipelineStep {
  key: string;
  label: string;
  actorName?: string;
  actorRole?: string;
  timestamp?: string;
  notes?: string;
  state: 'done' | 'current' | 'upcoming' | 'rejected';
}

export interface UnifiedApprovalRecord {
  uid: string;
  id: string;
  module: ApprovalModule;
  title: string;
  subtitle: string;
  requester: string;
  requesterRole: string;
  projectName: string;
  dateLabel: string;
  createdAt: string;
  amount: number;
  urgency: string;
  normalizedStatus: string;
  stageLabel: string;
  isPending: boolean;
  isHistory: boolean;
  canAct: boolean;
  requiresPassphraseOnReject: boolean;
  rejectionReason?: string;
  pipeline: PipelineStep[];
  raw: any;
}

const EXECUTIVE_ROLES = ['owner', 'president_director', 'operational_director', 'director'];

export function normalizeLegacyRequestStatus(status?: string): string {
  switch (status) {
    case 'Pending':
      return 'PR_PENDING';
    case 'Approved':
      return 'PR_APPROVED';
    case 'Rejected':
      return 'PR_REJECTED';
    case 'Delivered':
      return 'DELIVERED';
    default:
      return status || 'PR_PENDING';
  }
}

export function canUserActOnProcurement(status: string, userRole?: string): boolean {
  const role = (userRole || '').toLowerCase();
  if (status === 'PR_PENDING') {
    return ['owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'admin_project'].includes(role);
  }
  if (status === 'PR_REVIEWED') {
    return ['owner', 'president_director', 'operational_director', 'director'].includes(role);
  }
  if (status === 'PO_PENDING_FINANCE') {
    return ['owner', 'president_director', 'director'].includes(role);
  }
  return false;
}

export function canUserActOnSpkl(
  workflowStatus: string,
  userRole?: string,
  userId?: string,
  raw?: any
): boolean {
  const role = (userRole || '').toLowerCase();
  const isExec = EXECUTIVE_ROLES.includes(role);
  if (isExec && ['submitted', 'supervisor_verified', 'pm_approved'].includes(workflowStatus)) {
    return true;
  }

  if (workflowStatus === 'submitted') {
    const assigned = raw?.assignedSupervisorId?._id || raw?.assignedSupervisorId;
    if (assigned && userId) return String(assigned) === String(userId);
    return ['supervisor', 'site_manager', 'foreman', 'admin_project'].includes(role);
  }
  if (workflowStatus === 'supervisor_verified') {
    const assigned = raw?.assignedPmId?._id || raw?.assignedPmId;
    if (assigned && userId) return String(assigned) === String(userId);
    return ['site_manager', 'project_manager'].includes(role);
  }
  if (workflowStatus === 'pm_approved') {
    const assigned = raw?.assignedFinanceId?._id || raw?.assignedFinanceId;
    if (assigned && userId) return String(assigned) === String(userId);
    return ['finance', 'admin_project', 'accounting'].includes(role);
  }
  return false;
}

export function canUserActOnKasbon(status: string, userRole?: string): boolean {
  const role = (userRole || '').toLowerCase();
  return status === 'Pending' && ['owner', 'director'].includes(role);
}

export function buildProcurementPipeline(r: any, normalizedStatus: string): PipelineStep[] {
  const isRejected = normalizedStatus === 'PR_REJECTED';
  const hasReviewed = Boolean(r.reviewedBy?.reviewedAt);
  const hasOps = Boolean(r.opsApprovedBy?.approvedAt);
  const hasFinance = Boolean(r.financeApprovedBy?.approvedAt);

  const step1State: PipelineStep['state'] = hasReviewed
    ? isRejected && !hasOps
      ? 'rejected'
      : 'done'
    : normalizedStatus === 'PR_PENDING'
      ? 'current'
      : 'done';

  const step2State: PipelineStep['state'] = hasOps
    ? isRejected && !hasFinance
      ? 'rejected'
      : 'done'
    : normalizedStatus === 'PR_REVIEWED'
      ? 'current'
      : ['PR_APPROVED', 'PO_PENDING_FINANCE', 'MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED', 'PAID'].includes(normalizedStatus)
        ? 'done'
        : 'upcoming';

  const step3State: PipelineStep['state'] = hasFinance
    ? isRejected
      ? 'rejected'
      : 'done'
    : normalizedStatus === 'PO_PENDING_FINANCE'
      ? 'current'
      : ['MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED', 'PAID'].includes(normalizedStatus)
        ? 'done'
        : 'upcoming';

  return [
    {
      key: 'review',
      label: 'Reviu QC / SPV',
      actorName: r.reviewedBy?.user?.fullName || r.assignedReviewerId?.fullName,
      actorRole: r.reviewedBy?.role || 'Supervisor',
      timestamp: r.reviewedBy?.reviewedAt,
      notes: r.reviewedBy?.notes,
      state: step1State,
    },
    {
      key: 'ops',
      label: 'Approval Ops Director',
      actorName: r.opsApprovedBy?.user?.fullName || r.approvedBy?.fullName || r.assignedOpsApproverId?.fullName,
      actorRole: 'Ops Director',
      timestamp: r.opsApprovedBy?.approvedAt,
      notes: r.opsApprovedBy?.notes,
      state: step2State,
    },
    {
      key: 'finance',
      label: 'Approval Finance (PO)',
      actorName: r.financeApprovedBy?.user?.fullName || r.assignedFinanceApproverId?.fullName,
      actorRole: 'Finance / Direksi',
      timestamp: r.financeApprovedBy?.approvedAt,
      notes: r.financeApprovedBy?.notes,
      state: step3State,
    },
  ];
}

export function buildSpklPipeline(s: any): PipelineStep[] {
  const wf = s.workflowStatus || 'submitted';
  const isRejected = wf === 'rejected';
  const spvSig = s.signatures?.supervisor;
  const pmSig = s.signatures?.projectManager;
  const finSig = s.signatures?.financeDirector;

  const spvSigned = Boolean(spvSig?.signedAt);
  const pmSigned = Boolean(pmSig?.signedAt);
  const finSigned = Boolean(finSig?.signedAt);

  return [
    {
      key: 'supervisor',
      label: 'Verifikasi Supervisor',
      actorName: spvSig?.signedByName || s.assignedSupervisorId?.fullName,
      actorRole: 'Supervisor',
      timestamp: spvSig?.signedAt,
      notes: spvSig?.note,
      state: spvSigned
        ? 'done'
        : isRejected && !spvSigned
          ? 'rejected'
          : wf === 'submitted'
            ? 'current'
            : 'upcoming',
    },
    {
      key: 'pm',
      label: 'Approval Project Manager',
      actorName: pmSig?.signedByName || s.assignedPmId?.fullName,
      actorRole: 'Project Manager',
      timestamp: pmSig?.signedAt,
      notes: pmSig?.note,
      state: pmSigned
        ? 'done'
        : isRejected && spvSigned && !pmSigned
          ? 'rejected'
          : wf === 'supervisor_verified'
            ? 'current'
            : wf === 'pm_approved' || wf === 'finance_verified'
              ? 'done'
              : 'upcoming',
    },
    {
      key: 'finance',
      label: 'Verifikasi Finance',
      actorName: finSig?.signedByName || s.assignedFinanceId?.fullName,
      actorRole: 'Finance',
      timestamp: finSig?.signedAt,
      notes: finSig?.note,
      state: finSigned
        ? 'done'
        : isRejected && pmSigned && !finSigned
          ? 'rejected'
          : wf === 'pm_approved'
            ? 'current'
            : wf === 'finance_verified'
              ? 'done'
              : 'upcoming',
    },
  ];
}

export function buildKasbonPipeline(k: any): PipelineStep[] {
  const status = k.status || 'Pending';
  const isRejected = status === 'Rejected';
  const isApproved = status === 'Approved' || status === 'Paid';

  return [
    {
      key: 'request',
      label: 'Pengajuan Kasbon',
      actorName: k.userId?.fullName,
      actorRole: k.userId?.role,
      timestamp: k.createdAt,
      state: 'done',
    },
    {
      key: 'director',
      label: 'Otorisasi Direksi / Owner',
      actorName: k.approvedBy?.fullName,
      actorRole: 'Direksi / Owner',
      timestamp: k.approvedAt,
      state: isApproved ? 'done' : isRejected ? 'rejected' : 'current',
    },
  ];
}

export function getProcurementStageLabel(normalizedStatus: string): string {
  switch (normalizedStatus) {
    case 'PR_PENDING':
      return 'Menunggu Reviu QC/SPV';
    case 'PR_REVIEWED':
      return 'Menunggu Approval Ops';
    case 'PO_PENDING_FINANCE':
      return 'Menunggu Approval Finance';
    case 'PR_APPROVED':
      return 'PR Disetujui (Sourcing)';
    case 'MUST_PURCHASE':
      return 'PO Terbit (Siap Beli)';
    case 'PR_REJECTED':
      return 'Ditolak';
    case 'DELIVERED':
    case 'PAID':
      return 'Selesai';
    default:
      return normalizedStatus;
  }
}

export function getSpklStageLabel(wf: string): string {
  switch (wf) {
    case 'submitted':
      return 'Menunggu Verifikasi SPV';
    case 'supervisor_verified':
      return 'Menunggu Approval PM';
    case 'pm_approved':
      return 'Menunggu Verifikasi Finance';
    case 'finance_verified':
      return 'Disetujui Penuh';
    case 'rejected':
      return 'Ditolak';
    default:
      return wf;
  }
}

export async function executeApprovalAction(
  item: UnifiedApprovalRecord,
  passphrase: string,
  notes?: string
): Promise<void> {
  if (item.module === 'request') {
    if (item.normalizedStatus === 'PR_PENDING') {
      await reviewMaterialRequest(item.id, { action: 'approve', passphrase, notes });
      return;
    }
    if (item.normalizedStatus === 'PR_REVIEWED') {
      await opsApproveMaterialRequest(item.id, { action: 'approve', passphrase, notes });
      return;
    }
    if (item.normalizedStatus === 'PO_PENDING_FINANCE') {
      await financeApproveMaterialRequest(item.id, { action: 'approve', passphrase, notes });
      return;
    }
    throw new Error(`Status pengadaan ${item.normalizedStatus} tidak berada pada tahap approval`);
  }

  if (item.module === 'spkl') {
    const wf = item.normalizedStatus;
    if (wf === 'submitted') {
      await api.post(`/spkl/${item.id}/verify-supervisor`, { passphrase, note: notes });
      return;
    }
    if (wf === 'supervisor_verified') {
      await api.post(`/spkl/${item.id}/approve-pm`, { passphrase, note: notes });
      return;
    }
    if (wf === 'pm_approved') {
      await api.post(`/spkl/${item.id}/verify-finance`, { passphrase, note: notes });
      return;
    }
    throw new Error(`Status SPKL ${wf} tidak berada pada tahap approval`);
  }

  if (item.module === 'kasbon') {
    await api.put(`/kasbon/${item.id}`, { status: 'Approved', passphrase });
  }
}

export async function executeRejectionAction(
  item: UnifiedApprovalRecord,
  rejectionReason: string,
  passphrase: string
): Promise<void> {
  if (item.module === 'request') {
    if (item.normalizedStatus === 'PR_PENDING') {
      await reviewMaterialRequest(item.id, {
        action: 'reject',
        passphrase,
        rejectionReason,
        notes: rejectionReason,
      });
      return;
    }
    if (item.normalizedStatus === 'PR_REVIEWED') {
      await opsApproveMaterialRequest(item.id, {
        action: 'reject',
        passphrase,
        rejectionReason,
        notes: rejectionReason,
      });
      return;
    }
    if (item.normalizedStatus === 'PO_PENDING_FINANCE') {
      await financeApproveMaterialRequest(item.id, {
        action: 'reject',
        passphrase,
        rejectionReason,
        notes: rejectionReason,
      });
      return;
    }
    throw new Error(`Status pengadaan ${item.normalizedStatus} tidak dapat ditolak dari tahap ini`);
  }

  if (item.module === 'spkl') {
    await api.post(`/spkl/${item.id}/reject`, { reason: rejectionReason });
    return;
  }

  if (item.module === 'kasbon') {
    await api.put(`/kasbon/${item.id}`, {
      status: 'Rejected',
      rejectionReason,
    });
  }
}
