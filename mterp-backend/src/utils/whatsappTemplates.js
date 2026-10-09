/**
 * WhatsApp Notification Message Templates for MTERP Enterprise
 * Location: mterp-backend/src/utils/whatsappTemplates.js
 */

const APP_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

function formatRupiah(amount) {
  if (!amount || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

/**
 * 📦 Material Request Created -> Sent to Procurement
 */
function formatMaterialRequestCreated(request) {
  const urgencyIcon = {
    High: '🔴 *URGENT / TINGGI*',
    Normal: '🟡 *NORMAL*',
    Low: '🟢 *RENDAH*',
  }[request.urgency] || '🟡 *NORMAL*';

  const dateNeeded = formatDate(request.dateNeeded);
  const projectName = request.projectId?.nama || 'Proyek Umum / Workshop';
  const projectLoc = request.projectId?.lokasi ? `(${request.projectId.lokasi})` : '';
  const requester = request.requestedBy?.fullName || 'Staf Lapangan';
  const requesterRole = request.requestedBy?.role || 'User';

  return [
    '📦 *PERMINTAAN MATERIAL BARU (MATERIAL REQUEST)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    'Permintaan pengadaan material baru telah diajukan dari lapangan:',
    '',
    `📌 *Detail Pengadaan:*`,
    `• *Item / Material:* *${request.item}*`,
    `• *Jumlah:* *${request.qty} ${request.unit || 'Pcs'}*`,
    `• *Proyek:* ${projectName} ${projectLoc}`,
    `• *Tingkat Urgensi:* ${urgencyIcon}`,
    `• *Tanggal Dibutuhkan:* ${dateNeeded}`,
    request.costEstimate ? `• *Estimasi Anggaran:* ${formatRupiah(request.costEstimate)}` : null,
    `• *Diajukan Oleh:* ${requester} (${requesterRole})`,
    request.purpose ? `• *Keperluan:* ${request.purpose}` : null,
    '',
    `🔗 *Tinjau & Tindak Lanjut di MTERP:*`,
    `${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ✅ / ❌ Material Request Status Changed (Approved / Rejected)
 */
function formatMaterialRequestStatus(request, status, reason) {
  const isApproved = status === 'Approved';
  const header = isApproved
    ? '✅ *MATERIAL REQUEST DISETUJUI (APPROVED)*'
    : '❌ *MATERIAL REQUEST DITOLAK (REJECTED)*';

  const projectName = request.projectId?.nama || 'Proyek';
  const approver = request.approvedBy?.fullName || 'Manajemen';

  return [
    header,
    'PT MEGA TAMA ENERCO — MTERP',
    '',
    `Pemberitahuan pembaruan status permintaan material:`,
    '',
    `• *Item:* *${request.item}* (${request.qty} ${request.unit || 'Pcs'})`,
    `• *Proyek:* ${projectName}`,
    `• *Status:* *${status.toUpperCase()}*`,
    isApproved ? `• *Disetujui Oleh:* ${approver}` : `• *Alasan Penolakan:* ${reason || 'Tidak ada catatan'}`,
    isApproved ? '• *Tindakan Lanjutan:* Tim Procurement segera menyiapkan Purchase Order (PO) / Sourcing.' : null,
    '',
    `🔗 *Buka Lembar Material:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ⏱️ SPKL Overtime Approved -> Sent to Finance & HR
 */
function formatSpklFinalApproved(spkl) {
  const projectName = spkl.projectId?.nama || 'Proyek Lapangan';
  const workerCount = Array.isArray(spkl.workers) ? spkl.workers.length : 1;
  const totalHours = spkl.effectiveHours || spkl.totalHours || '—';

  return [
    '⏱️ *LEMBUR DISETUJUI (SPKL READY FOR PAYROLL)*',
    'PT MEGA TAMA ENERCO — MTERP',
    '',
    'Surat Perintah Kerja Lembur (SPKL) telah disetujui tuntas:',
    '',
    `• *Nomor SPKL:* #${spkl.spklNumber || spkl._id}`,
    `• *Proyek:* ${projectName}`,
    `• *Tanggal Lembur:* ${formatDate(spkl.date)}`,
    `• *Pekerja:* ${workerCount} orang`,
    `• *Total Jam Lembur:* ${totalHours} jam`,
    `• *Pekerjaan / Scope:* ${spkl.description || 'Pekerjaan Lapangan'}`,
    '',
    'ℹ️ *Pemberitahuan Finance & HR:* Data lembur telah siap direkap ke perhitungan Slip Gaji periode berjalan.',
    '',
    `🔗 *Tinjau SPKL:* ${APP_URL}/spkl`,
  ].join('\n');
}

/**
 * 💵 Kasbon Alert -> Sent to Finance & Executive
 */
function formatKasbonAlert(kasbon, type = 'submitted') {
  const isSubmission = type === 'submitted';
  const header = isSubmission
    ? '💵 *PENGAJUAN KASBON BARU*'
    : '💰 *KASBON DICAIRKAN (DISBURSED)*';

  const requester = kasbon.userId?.fullName || 'Karyawan';
  const amount = formatRupiah(kasbon.amount);

  return [
    header,
    'PT MEGA TAMA ENERCO — MTERP',
    '',
    isSubmission ? 'Pengajuan kasbon operasional baru membutuhkan verifikasi:' : 'Kasbon operasional telah disetujui dan dicairkan:',
    '',
    `• *Pemohon:* ${requester}`,
    `• *Jumlah:* *${amount}*`,
    `• *Keperluan:* ${kasbon.reason || 'Operasional Lapangan'}`,
    `• *Tanggal:* ${formatDate(kasbon.createdAt)}`,
    '',
    `🔗 *Tinjau Kasbon:* ${APP_URL}/kasbon`,
  ].join('\n');
}

module.exports = {
  formatRupiah,
  formatDate,
  formatMaterialRequestCreated,
  formatMaterialRequestStatus,
  formatSpklFinalApproved,
  formatKasbonAlert,
};
