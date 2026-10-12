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
 * Helper to build multi-item line list text
 */
function buildItemsText(items, maxLines = 5) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lines = items.slice(0, maxLines).map((itm, idx) => {
    const spec = itm.specifications ? ` [Spec: ${itm.specifications}]` : '';
    const rate = itm.budgetUnitRate ? ` (Est: ${formatRupiah(itm.budgetUnitRate)})` : '';
    return `  ${idx + 1}. *${itm.item}* — ${itm.qty} ${itm.unit || 'Pcs'}${spec}${rate}`;
  });

  if (items.length > maxLines) {
    lines.push(`  _...dan ${items.length - maxLines} material lainnya_`);
  }
  return lines.join('\n');
}

/**
 * 📦 1. Purchase Request Created -> Sent to Supervisor / QC & Procurement
 */
function formatPurchaseRequestCreated(request) {
  const urgencyIcon = {
    Urgent: '🚨 *URGENT*',
    High: '🔴 *TINGGI*',
    Normal: '🟡 *NORMAL*',
    Low: '🟢 *RENDAH*',
  }[request.urgency] || '🟡 *NORMAL*';

  const dateNeeded = formatDate(request.dateNeeded);
  const projectName = request.projectId?.nama || 'Proyek Umum / Workshop';
  const projectLoc = request.projectId?.lokasi ? `(${request.projectId.lokasi})` : '';
  const requester = request.requestedBy?.fullName || 'Staf Lapangan';
  const requesterRole = request.requestedBy?.role || 'User';
  const items = Array.isArray(request.items) && request.items.length > 0 ? request.items : [{
    item: request.item,
    specifications: '',
    qty: request.qty,
    unit: request.unit,
    budgetUnitRate: request.costEstimate ? (Number(request.costEstimate) / (Number(request.qty) || 1)) : 0,
    totalBudget: request.costEstimate || 0,
  }];

  const totalEst = request.totalEstimatedBudget || request.costEstimate || items.reduce((acc, i) => acc + (i.totalBudget || 0), 0);

  return [
    '📦 *PENGAJUAN PURCHASE REQUEST (PR) BARU*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PR: *${request.prNumber || 'DRAFT-PR'}*`,
    `Proyek: *${projectName}* ${projectLoc}`,
    `Tingkat Urgensi: ${urgencyIcon}`,
    `Target Kebutuhan: ${dateNeeded}`,
    `Diajukan Oleh: ${requester} (${requesterRole})`,
    request.purpose ? `Keperluan: _${request.purpose}_` : null,
    '',
    `📋 *Daftar Material (${items.length} Baris):*`,
    buildItemsText(items),
    '',
    `💰 *Total Estimasi Anggaran:* *${formatRupiah(totalEst)}*`,
    '',
    `ℹ️ *Status:* Menunggu Tinjauan Teknis QC / Supervisor.`,
    `🔗 *Tinjau di MTERP:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 🔍 2. PR Reviewed by Supervisor / QC -> Sent to Operations Director
 */
function formatPrReviewed(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const reviewer = request.reviewedBy?.user?.fullName || request.reviewedBy?.user || 'Supervisor / QC';
  const itemsCount = request.items?.length || 1;

  return [
    '🔍 *PURCHASE REQUEST TELAH DITINJAU TEKNIS (REVIEWED)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PR: *${request.prNumber || 'DRAFT-PR'}*`,
    `Proyek: *${projectName}*`,
    `Jumlah Material: *${itemsCount} Baris*`,
    `Ditinjau Oleh: *${reviewer}*`,
    request.reviewedBy?.notes ? `Catatan QC: _"${request.reviewedBy.notes}"_` : null,
    '',
    'ℹ️ *Tindakan Lanjutan:* Menunggu persetujuan operasional Direktur Operasional dengan passphrase manajemen.',
    `🔗 *Otorisasi PR:* ${APP_URL}/approvals`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ✅ 3. PR Approved by Operations Director -> Ready for Vendor Sourcing
 */
function formatPrApproved(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const approver = request.opsApprovedBy?.user?.fullName || request.opsApprovedBy?.user || 'Direktur Operasional';
  const totalEst = request.totalEstimatedBudget || request.costEstimate || 0;

  return [
    '✅ *PURCHASE REQUEST DISETUJUI (PR APPROVED)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PR: *${request.prNumber || 'DRAFT-PR'}*`,
    `Proyek: *${projectName}*`,
    `Disetujui Oleh: *${approver}*`,
    `Plafon Anggaran PR: *${formatRupiah(totalEst)}*`,
    '',
    'ℹ️ *Tindakan Lanjutan:* Tim Procurement segera melakukan sourcing dan input perbandingan harga vendor (Supplier Price Comparison).',
    `🔗 *Buka Komparasi Supplier:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 📊 4. Multi-Supplier Price Comparison Submitted -> Sent to Finance Director
 */
function formatPoSourcingSubmitted(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const vendorName = request.selectedSupplier?.supplierName || 'Supplier Rekomendasi';
  const landedCost = request.selectedSupplier?.totalLandedCost || request.poTotalAmount || 0;
  const shipping = request.selectedSupplier?.shippingCost || request.poShippingCost || 0;
  const terms = request.selectedSupplier?.paymentTerms || 'Tempo 14 Hari';

  return [
    '📊 *KOMPARASI HARGA SUPPLIER DIAJUKAN (PO SOURCING)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PR: *${request.prNumber || 'DRAFT-PR'}*`,
    `Proyek: *${projectName}*`,
    `Supplier Rekomendasi: *${vendorName}*`,
    `Termin Pembayaran: *${terms}*`,
    `Biaya Logistik / Ongkir: ${formatRupiah(shipping)}`,
    `Total Landed Cost: *${formatRupiah(landedCost)}*`,
    '',
    'ℹ️ *Tindakan Lanjutan:* Menunggu persetujuan Direktur Keuangan & Budget Control untuk penerbitan PO resmi.',
    `🔗 *Tinjau & Otorisasi PO:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 📑 5. PO Approved by Finance Director -> Tagged MUST_PURCHASE
 */
function formatPoApproved(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const vendorName = request.selectedSupplier?.supplierName || 'Supplier';
  const poTotal = request.poTotalAmount || 0;

  return [
    '📑 *PURCHASE ORDER TERBIT & DISETUJUI (MUST PURCHASE)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PO: *${request.poNumber}*`,
    `Ref. PR: ${request.prNumber || '-'}`,
    `Proyek: *${projectName}*`,
    `Vendor / Supplier: *${vendorName}*`,
    `Total Tagihan PO: *${formatRupiah(poTotal)}*`,
    `Status: *MUST_PURCHASE (Siap Dibeli)*`,
    '',
    'ℹ️ *Pemberitahuan Procurement:* Surat Perintah Pembelian resmi telah terkunci. Silakan segera eksekusi pesanan ke supplier.',
    `🔗 *Unduh Dokumen PO Resmi:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 🚚 6. Material Dispatched by Supplier / Driver -> ON_THE_WAY
 */
function formatPoDispatched(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const dispatch = request.dispatchInfo || {};
  const driver = dispatch.driverName || 'Armada Supplier';
  const phone = dispatch.driverPhone ? `(HP: ${dispatch.driverPhone})` : '';
  const plate = dispatch.vehiclePlate ? `[${dispatch.vehiclePlate}]` : '';

  return [
    '🚚 *MATERIAL DALAM PENGIRIMAN (ON THE WAY)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PO: *${request.poNumber || request.prNumber}*`,
    `Proyek Tujuan: *${projectName}*`,
    `Supir / Ekspedisi: *${driver}* ${phone} ${plate}`,
    dispatch.eta ? `Estimasi Tiba (ETA): *${dispatch.eta}*` : null,
    dispatch.notes ? `Catatan Pengiriman: _"${dispatch.notes}"_` : null,
    '',
    '⚠️ *Instruksi Lapangan:* Tim logistik proyek dimohon bersiap di lokasi untuk memeriksa fisik barang dan mengambil foto bukti penerimaan saat armada tiba.',
    `🔗 *Lacak Status Pengiriman:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 🏁 7. Material Received on Site with Photo Evidence -> DELIVERED / DONE
 */
function formatMaterialDelivered(request) {
  const projectName = request.projectId?.nama || 'Proyek';
  const receiver = request.deliveryProof?.receivedBy?.fullName || request.deliveryProof?.receivedBy || 'Staff Lapangan';
  const condition = request.deliveryProof?.overallCondition === 'Good' ? 'Lengkap & Baik' : 'Ada Selisih / Kerusakan';
  const itemsCount = request.items?.length || 1;

  return [
    '🏁 *MATERIAL SELESAI DITERIMA DI PROYEK (DELIVERED)*',
    'PT MEGA TAMA ENERCO — MTERP RADAR',
    '',
    `Nomor PO: *${request.poNumber || request.prNumber}*`,
    `Proyek: *${projectName}*`,
    `Total Baris Material: *${itemsCount} Baris*`,
    `Penerima di Lokasi: *${receiver}*`,
    `Kondisi Fisik: *${condition}*`,
    'Bukti Fisik: Foto kedatangan proyek telah terverifikasi.',
    '',
    '✅ *Update Otomatis:* Seluruh material telah otomatis masuk ke stok inventaris proyek dan realisasi anggaran RAB telah tercatat.',
    `🔗 *Lihat Bukti Terima (GRN):* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ✅ / ❌ Material Request Status Changed (Approved / Rejected) - Legacy compatibility
 */
function formatMaterialRequestStatus(request, status, reason) {
  const isApproved = status === 'Approved' || status === 'PR_APPROVED';
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
    `• *Nomor PR:* *${request.prNumber || '-'}*`,
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

/**
 * 🎯 Penugasan Otorisasi Dokumen Pengadaan (PR / PO)
 */
function formatAuthorizerAssigned(request, roleLabel, assignedUser, assignedBy) {
  const projectName = typeof request.projectId === 'object' ? request.projectId?.nama : 'Proyek Umum / Workshop';
  const totalEst = request.poTotalAmount || request.totalEstimatedBudget || request.costEstimate || 0;
  const items = Array.isArray(request.items) ? request.items : [];

  return [
    '📑 *PENUGASAN OTORISASI DOKUMEN PENGADAAN*',
    'PT MEGA TAMA ENERCO — MTERP ENTERPRISE',
    '',
    `Halo *${assignedUser?.fullName || 'Bapak/Ibu'}*,`,
    `Anda telah ditugaskan oleh *${assignedBy?.fullName || 'Owner/Direksi'}* sebagai:`,
    `🎯 *${roleLabel}*`,
    '',
    `Nomor Dokumen: *${request.prNumber || 'DRAFT-PR'}* ${request.poNumber ? `(PO: *${request.poNumber}*)` : ''}`,
    `Proyek: *${projectName || 'Proyek Umum'}*`,
    `Total Nilai: *${formatRupiah(totalEst)}*`,
    items.length > 0 ? `Jumlah Material: *${items.length} Baris Item*` : null,
    request.purpose ? `Keperluan: _${request.purpose}_` : null,
    '',
    `Mohon login ke sistem MTERP untuk meninjau dan memproses otorisasi dokumen saat tiba di tahap Anda:`,
    `🔗 *Buka MTERP Materials:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Enterprise — ${new Date().toLocaleString('id-ID')} WIB_`,
  ].filter(Boolean).join('\n');
}

module.exports = {
  formatRupiah,
  formatDate,
  formatPurchaseRequestCreated,
  formatMaterialRequestCreated: formatPurchaseRequestCreated, // Alias for backward compatibility
  formatPrReviewed,
  formatPrApproved,
  formatPoSourcingSubmitted,
  formatPoApproved,
  formatPoDispatched,
  formatMaterialDelivered,
  formatMaterialRequestStatus,
  formatSpklFinalApproved,
  formatKasbonAlert,
  formatAuthorizerAssigned,
};
