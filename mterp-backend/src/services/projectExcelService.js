const ExcelJS = require('exceljs');

// Helper: add a styled header row + data rows to an ExcelJS worksheet
function addSheetData(ws, headers, rows, colWidth) {
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'center' };
  });
  rows.forEach((r) => ws.addRow(r));
  ws.columns = headers.map(() => ({ width: colWidth || 22 }));
}

// Helper: extract raw scalar or string value from ExcelJS cell value
function getCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val instanceof Date) return val;
    if (val.text !== undefined) return val.text;
    if (val.result !== undefined) return val.result;
    if (Array.isArray(val.richText)) return val.richText.map((r) => (r && r.text) || '').join('');
  }
  return val;
}

// Helper: convert ExcelJS worksheet to array-of-objects with flexible header row detection
function sheetToJson(ws) {
  const rows = [];
  if (!ws || !ws.rowCount) return rows;

  const norm = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  let headerRowIndex = 1;
  let headers = [];

  // Inspect up to the first 5 rows to identify the actual header row
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const values = row.values;
    if (!values || values.length <= 1) continue;

    let matchCount = 0;
    for (let i = 1; i < values.length; i++) {
      const v = norm(getCellValue(values[i]));
      if (
        ['wbs', 'kode', 'nama', 'task', 'item', 'tipe', 'type', 'kategori', 'category', 'volume', 'qty', 'satuan', 'unit', 'harga', 'rate', 'biaya', 'durasi', 'mulai', 'selesai', 'pekerjaan', 'barang', 'deskripsi', 'uraian', 'proyek', 'project'].some((k) => v.includes(k))
      ) {
        matchCount++;
      }
    }
    if (matchCount >= 2) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = ws.getRow(headerRowIndex);
  const hVals = headerRow.values;
  if (!hVals) return rows;

  for (let i = 1; i < hVals.length; i++) {
    headers.push(String(getCellValue(hVals[i]) || '').trim());
  }

  for (let r = headerRowIndex + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = row.values;
    if (!values || values.length <= 1) continue;
    const obj = {};
    let hasAnyValue = false;
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      const v = getCellValue(values[i + 1]);
      if (v !== '' && v !== null && v !== undefined) hasAnyValue = true;
      obj[headers[i]] = v ?? '';
    }
    if (hasAnyValue) rows.push(obj);
  }

  return rows;
}

/**
 * Generate a blank MTERP Project WBS Excel Template
 * @returns {Promise<Buffer>}
 */
async function generateWbsTemplate() {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Project Info
  const wsProject = wb.addWorksheet('Project Info');
  addSheetData(
    wsProject,
    ['Nama Proyek', 'Lokasi', 'Deskripsi', 'Total Anggaran', 'Tanggal Mulai', 'Tanggal Selesai'],
    [['Pembangunan Gedung & Fasilitas Terpadu', 'Jakarta Selatan', 'Pembangunan struktur gedung dan fasilitas penunjang proyek', 1500000000, '2026-04-01', '2026-12-31']],
    25
  );

  // Sheet 2: WBS & Task Items (Single Source of Truth WBS Table)
  const wsWBS = wb.addWorksheet('WBS & Task Items');
  addSheetData(
    wsWBS,
    ['Kode WBS', 'Level', 'Tipe', 'Nama Task / Item', 'Kategori', 'Volume', 'Satuan', 'Harga Satuan', 'Total Biaya', 'Durasi (Hari)', 'Tanggal Mulai', 'Tanggal Selesai'],
    [
      ['1', 1, 'summary', 'Pekerjaan Struktur Bawah (Substructure)', 'general', 1, 'ls', 0, 0, 30, '2026-04-01', '2026-04-30'],
      ['1.1', 2, 'work', 'Pemancangan Spun Pile Dia 50cm', 'labor', 120, 'titik', 350000, 42000000, 14, '2026-04-01', '2026-04-14'],
      ['1.2', 2, 'supply', 'Spun Pile Beton Dia 50cm L=12m', 'material', 120, 'btg', 2500000, 300000000, 10, '2026-04-01', '2026-04-10'],
      ['1.3', 2, 'work', 'Galian Tanah Pile Cap & Tie Beam', 'labor', 450, 'M3', 85000, 38250000, 12, '2026-04-10', '2026-04-22'],
      ['1.4', 2, 'supply', 'Ready Mix Concrete K-350 Pile Cap', 'material', 180, 'M3', 950000, 171000000, 7, '2026-04-15', '2026-04-22'],
      ['1.5', 2, 'milestone', 'Milestone: Struktur Bawah Selesai', 'general', 0, 'ls', 0, 0, 0, '2026-04-30', '2026-04-30'],
      ['2', 1, 'summary', 'Pekerjaan Struktur Atas (Superstructure)', 'general', 1, 'ls', 0, 0, 60, '2026-05-01', '2026-06-30'],
      ['2.1', 2, 'work', 'Pembesian Balok & Pelat Lantai', 'labor', 15000, 'kg', 3500, 52500000, 20, '2026-05-01', '2026-05-20'],
      ['2.2', 2, 'supply', 'Besi Beton Ulir D16 & D19 (SNI)', 'material', 15000, 'kg', 14500, 217500000, 15, '2026-05-01', '2026-05-15'],
      ['2.3', 2, 'work', 'Pengecoran Pelat & Balok Lantai 1', 'labor', 220, 'M3', 250000, 55000000, 10, '2026-05-21', '2026-05-31'],
      ['2.4', 2, 'supply', 'Ready Mix Concrete K-300 Lantai 1', 'material', 220, 'M3', 920000, 202400000, 5, '2026-05-21', '2026-05-26'],
      ['2.5', 2, 'milestone', 'Milestone: Topping Off Lantai 1', 'general', 0, 'ls', 0, 0, 0, '2026-06-30', '2026-06-30'],
    ],
    20
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Parse an uploaded Excel file (Buffer) and extract WBS, Project Info, Supplies, and Tasks.
 * @param {Buffer} fileBuffer - File data buffer
 * @param {string} [originalFilename] - Original filename for project name fallback
 * @returns {Promise<{ projectData: object, tasks: Array, supplies: Array, workItems: Array }>}
 */
async function parseProjectWorkbook(fileBuffer, originalFilename = '') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuffer);

  const norm = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  const findCol = (keys, targets) => {
    if (!keys || !targets) return '';
    const exact = keys.find((k) => targets.includes(norm(k)));
    if (exact) return exact;
    const sub = keys.find((k) => {
      const nk = norm(k);
      return targets.some((t) => nk.includes(t) || t.includes(nk));
    });
    return sub || '';
  };

  const parseDate = (v) => {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().split('T')[0];
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  };

  const sheets = wb.worksheets;

  // Determine WBS sheet
  let wbsSheet = null;
  let legacySuppliesSheet = null;
  let legacyWorkSheet = null;
  let infoSheet = null;

  for (const s of sheets) {
    const nameNorm = norm(s.name);
    if (/wbs|task|jadwal|schedule|rencana|rab|item/i.test(nameNorm)) {
      wbsSheet = s;
    } else if (/supply|material|barang|pengadaan/i.test(nameNorm)) {
      legacySuppliesSheet = s;
    } else if (/work|pekerjaan/i.test(nameNorm)) {
      legacyWorkSheet = s;
    } else if (/info|proyek|project/i.test(nameNorm)) {
      infoSheet = s;
    }
  }

  // If no explicit WBS sheet found, inspect each sheet's headers
  if (!wbsSheet && !legacySuppliesSheet && !legacyWorkSheet) {
    if (sheets.length === 1) {
      const rows = sheetToJson(sheets[0]);
      if (rows.length > 0) {
        const keys = Object.keys(rows[0]).map(norm);
        const taskHeaderMatches = keys.filter((k) =>
          ['wbs', 'kodewbs', 'tipe', 'type', 'kategori', 'category', 'volume', 'qty', 'satuan', 'unit', 'harga', 'hargasatuan', 'biaya', 'totalbiaya', 'pekerjaan', 'task', 'nama'].some((t) => k.includes(t))
        ).length;
        if (taskHeaderMatches >= 2) {
          wbsSheet = sheets[0];
        } else {
          infoSheet = sheets[0];
        }
      }
    } else if (sheets.length >= 2) {
      const s2Rows = sheetToJson(sheets[1]);
      if (s2Rows.length > 0) {
        const s2Keys = Object.keys(s2Rows[0]).map(norm);
        if (s2Keys.some((k) => ['wbs', 'tipe', 'type', 'level', 'kategori', 'volume', 'harga', 'biaya'].some((t) => k.includes(t)))) {
          wbsSheet = sheets[1];
          infoSheet = sheets[0];
        }
      }
      if (!wbsSheet) {
        for (let i = 0; i < sheets.length; i++) {
          const rows = sheetToJson(sheets[i]);
          if (rows.length > 0) {
            const keys = Object.keys(rows[0]).map(norm);
            const matches = keys.filter((k) => ['wbs', 'tipe', 'type', 'kategori', 'volume', 'satuan', 'harga', 'biaya', 'task', 'pekerjaan'].some((t) => k.includes(t))).length;
            if (matches >= 2) {
              wbsSheet = sheets[i];
              if (i !== 0 && !infoSheet) infoSheet = sheets[0];
              break;
            }
          }
        }
      }
    }
  }

  // Parse Project Info
  let projectData = {
    nama: originalFilename ? originalFilename.replace(/\.(xlsx|xls|csv)$/i, '') : '',
    lokasi: '',
    description: '',
    totalBudget: 0,
    startDate: '',
    endDate: '',
  };

  if (infoSheet && infoSheet !== wbsSheet) {
    const projectRows = sheetToJson(infoSheet);
    if (projectRows.length > 0) {
      const row = projectRows[0];
      const keys = Object.keys(row);
      const f = (targets) => findCol(keys, targets);

      projectData = {
        nama: String(row[f(['namaproyek', 'projectname', 'nama'])] || projectData.nama),
        lokasi: String(row[f(['lokasi', 'location'])] || ''),
        description: String(row[f(['deskripsi', 'description', 'desc'])] || ''),
        totalBudget: Number(row[f(['totalanggaran', 'totalbudget', 'anggaran', 'budget'])]) || 0,
        startDate: parseDate(row[f(['tanggalmulai', 'startdate', 'mulai', 'start', 'tglmulai'])]),
        endDate: parseDate(row[f(['tanggalselesai', 'enddate', 'selesai', 'end', 'tglselesai'])]),
      };
    }
  }

  const tasks = [];
  const supplies = [];
  const workItems = [];

  if (wbsSheet) {
    const rows = sheetToJson(wbsSheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const keys = Object.keys(row);
      const f = (targets) => findCol(keys, targets);

      const name = String(row[f(['namataskitem', 'namatask', 'namabarang', 'namapekerjaan', 'uraianpekerjaan', 'itempekerjaan', 'deskripsi', 'uraian', 'pekerjaan', 'item', 'task', 'name', 'nama'])] || '').trim();
      if (!name) continue;

      const rawWbs = String(row[f(['kodewbs', 'wbs', 'kode', 'code', 'no', 'nomor', 'wbsid'])] || '').trim();
      const rawLevel = Number(row[f(['outlinelevel', 'level', 'tingkat', 'hierarki', 'kedalaman'])]);
      const outlineLevel = rawLevel >= 1 ? rawLevel : (rawWbs ? rawWbs.split('.').length : 1);

      const rawType = String(row[f(['tipe', 'type', 'itemtype', 'jenis', 'tipetask', 'tipeitem', 'jenisitem', 'jenispekerjaan', 'tipepekerjaan', 'tasktype', 'tipejenis'])] || '').toLowerCase().trim();
      const rawCat = String(row[f(['kategori', 'category', 'kategoriitem', 'kategoritask', 'klasifikasi', 'kelompok', 'tipekategori'])] || '').toLowerCase().trim();
      const rawUnit = String(row[f(['satuan', 'unit', 'uom', 'sat'])] || '').toLowerCase().trim();
      const rawName = name.toLowerCase().trim();

      const isSummary =
        /summary|grup|group|paket|induk|header/i.test(rawType) ||
        /summary|grup|group|paket/i.test(rawCat);

      const isMilestone =
        /milestone|target|serah terima|pho|fho|selesai proyek/i.test(rawType) ||
        /milestone/i.test(rawCat);

      const isSupply =
        !isSummary &&
        !isMilestone &&
        (
          /supply|material|barang|bahan|pengadaan|logistik|suplai|mat\b/i.test(rawType) ||
          /supply|material|barang|bahan|pengadaan|logistik|suplai|mat\b/i.test(rawCat) ||
          (/sak|zak|btg|batang|pail|kaleng|dus|box|roll|rol|lembar|lbr/i.test(rawUnit) && !/work|pekerjaan|jasa|upah|labor/i.test(rawType)) ||
          (/^(pengadaan|pembelian|pasokan|supply)\b/i.test(rawName) && !/work|pekerjaan|jasa/i.test(rawType))
        );

      let itemType = 'work';
      let category = 'labor';

      if (isSummary) {
        itemType = 'summary';
        category = 'general';
      } else if (isMilestone) {
        itemType = 'milestone';
        category = 'general';
      } else if (isSupply) {
        itemType = 'supply';
        category = 'material';
      } else {
        itemType = 'work';
        if (/alat|equip|heavy/i.test(rawCat) || /alat|equip/i.test(rawType)) {
          category = 'equipment';
        } else if (/sub|subkon|vendor/i.test(rawCat) || /sub/i.test(rawType)) {
          category = 'subcontractor';
        } else if (/over|overhead/i.test(rawCat)) {
          category = 'overhead';
        } else {
          category = 'labor';
        }
      }

      const quantity = itemType === 'milestone' ? 0 : (Number(row[f(['volume', 'qty', 'jumlah', 'vol', 'kuantitas', 'quantity', 'banyak'])]) || 1);
      const unit = String(row[f(['satuan', 'unit', 'uom', 'sat'])] || (itemType === 'supply' ? 'pcs' : 'ls')).trim();
      const unitRate = Number(row[f(['hargasatuan', 'rate', 'unitrate', 'harga', 'satuanharga', 'price', 'unitprice', 'tarif'])]) || 0;
      let cost = Number(row[f(['totalbiaya', 'biaya', 'cost', 'totalharga', 'total', 'amount', 'jumlahbiaya', 'subtotal'])]);
      if (isNaN(cost) || cost === 0) {
        cost = Math.round(quantity * unitRate);
      }

      const duration = itemType === 'milestone' ? 0 : (Number(row[f(['durasi', 'duration', 'hari', 'days', 'jangkawaktu', 'waktu'])]) || 7);
      const startDate = parseDate(row[f(['tanggalmulai', 'startdate', 'mulai', 'start', 'tglmulai'])]) || projectData.startDate || '';
      const endDate = parseDate(row[f(['tanggalselesai', 'enddate', 'selesai', 'end', 'tglselesai', 'deadline', 'target'])]) || projectData.endDate || '';

      const taskObj = {
        id: String(Date.now() + i),
        wbsCode: rawWbs || String(i + 1),
        outlineLevel,
        itemType,
        name,
        category,
        quantity,
        unit,
        unitRate,
        cost,
        duration,
        startDate,
        endDate,
        deliveryDate: endDate || startDate,
      };

      tasks.push(taskObj);

      if (itemType === 'supply') {
        supplies.push({
          id: taskObj.id,
          item: name,
          qty: quantity,
          unit,
          unitRate,
          cost,
          status: 'Pending',
          startDate,
          endDate,
          deliveryDate: endDate,
        });
      } else if (itemType === 'work') {
        workItems.push({
          id: taskObj.id,
          name,
          qty: quantity,
          volume: unit,
          unit,
          unitRate,
          cost,
          category,
          startDate,
          endDate,
          duration,
        });
      }
    }
  } else {
    // Fallback: Legacy 2/3 sheets parser (Supplies + Work Items)
    if (legacySuppliesSheet || sheets.length > 1) {
      const supplyRows = sheetToJson(legacySuppliesSheet || sheets[1]);
      for (const row of supplyRows) {
        const keys = Object.keys(row);
        const f = (targets) => findCol(keys, targets);
        const item = String(row[f(['namabarang', 'itemname', 'item', 'nama'])] || '').trim();
        if (!item) continue;
        const qty = Number(row[f(['jumlah', 'qty', 'quantity'])]) || 1;
        const cost = Number(row[f(['biaya', 'cost', 'harga'])]) || 0;
        const unitRate = qty > 0 ? Math.round(cost / qty) : cost;
        supplies.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          item,
          qty,
          unit: String(row[f(['satuan', 'unit'])] || 'pcs'),
          unitRate,
          cost,
          status: 'Pending',
          startDate: parseDate(row[f(['tanggalmulai', 'startdate', 'mulai', 'start'])]),
          endDate: parseDate(row[f(['tanggalselesai', 'enddate', 'selesai', 'end'])]),
        });
      }
    }

    if (legacyWorkSheet || sheets.length > 2) {
      const workRows = sheetToJson(legacyWorkSheet || sheets[2]);
      for (const row of workRows) {
        const keys = Object.keys(row);
        const f = (targets) => findCol(keys, targets);
        const name = String(row[f(['namapekerjaan', 'workitemname', 'name', 'nama', 'pekerjaan'])] || '').trim();
        if (!name) continue;
        const unitVal = String(row[f(['satuan', 'unit'])] || 'M2');
        const qty = Number(row[f(['jumlah', 'qty', 'quantity', 'volume'])]) || 1;
        const cost = Number(row[f(['biaya', 'cost', 'harga'])]) || 0;
        const unitRate = qty > 0 ? Math.round(cost / qty) : cost;
        workItems.push({
          id: Date.now() + Math.floor(Math.random() * 10000),
          name,
          qty,
          unit: unitVal,
          volume: unitVal,
          unitRate,
          cost,
          category: 'labor',
          startDate: parseDate(row[f(['tanggalmulai', 'startdate', 'mulai', 'start'])]),
          endDate: parseDate(row[f(['tanggalselesai', 'enddate', 'selesai', 'end'])]),
        });
      }
    }

    // Synthesize unified tasks array from supplies & workItems
    if (workItems.length > 0) {
      tasks.push({
        id: 'summary-work',
        wbsCode: '1',
        outlineLevel: 1,
        itemType: 'summary',
        name: 'Pekerjaan Konstruksi / Lapangan',
        category: 'labor',
        quantity: 1,
        unit: 'ls',
        unitRate: 0,
        cost: workItems.reduce((s, w) => s + (w.cost || 0), 0),
        duration: 30,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
      });
      workItems.forEach((w, idx) => {
        tasks.push({
          id: String(w.id || Date.now() + idx),
          wbsCode: `1.${idx + 1}`,
          outlineLevel: 2,
          itemType: 'work',
          name: w.name,
          category: w.category || 'labor',
          quantity: w.qty,
          unit: w.unit,
          unitRate: w.unitRate,
          cost: w.cost,
          duration: w.duration || 7,
          startDate: w.startDate || projectData.startDate,
          endDate: w.endDate || projectData.endDate,
        });
      });
    }

    if (supplies.length > 0) {
      const supWbs = tasks.length > 0 ? '2' : '1';
      tasks.push({
        id: 'summary-supply',
        wbsCode: supWbs,
        outlineLevel: 1,
        itemType: 'summary',
        name: 'Pengadaan & Material Proyek',
        category: 'material',
        quantity: 1,
        unit: 'ls',
        unitRate: 0,
        cost: supplies.reduce((s, sup) => s + (sup.cost || 0), 0),
        duration: 30,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
      });
      supplies.forEach((s, idx) => {
        tasks.push({
          id: String(s.id || Date.now() + idx),
          wbsCode: `${supWbs}.${idx + 1}`,
          outlineLevel: 2,
          itemType: 'supply',
          name: s.item,
          category: 'material',
          quantity: s.qty,
          unit: s.unit,
          unitRate: s.unitRate,
          cost: s.cost,
          duration: 7,
          startDate: s.startDate || projectData.startDate,
          endDate: s.endDate || projectData.endDate,
          deliveryDate: s.deliveryDate || s.endDate,
        });
      });
    }
  }

  // If projectData.totalBudget is 0, auto-sum from root tasks
  if (!projectData.totalBudget || projectData.totalBudget === 0) {
    const rootTasks = tasks.filter((t) => t.outlineLevel === 1);
    projectData.totalBudget =
      rootTasks.length > 0
        ? rootTasks.reduce((s, t) => s + (t.cost || 0), 0)
        : tasks.reduce((s, t) => s + (t.cost || 0), 0);
  }

  return { projectData, tasks, supplies, workItems };
}

module.exports = {
  addSheetData,
  getCellValue,
  sheetToJson,
  generateWbsTemplate,
  parseProjectWorkbook,
};
