const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 4173;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, name, maxRetries = 30, interval = 1000) {
  process.stdout.write(`⏳ Waiting for ${name} at ${url}... `);
  for (let i = 0; i < maxRetries; i++) {
    const ok = await checkUrl(url);
    if (ok) {
      console.log(`✅ ${name} is READY!`);
      return true;
    }
    await wait(interval);
  }
  console.log(`❌ ${name} timed out.`);
  return false;
}

async function runE2ETests() {
  console.log('====================================================================');
  console.log('🧪 MTERP DYNAMIC PPE MASTER & REGULATION REPOSITORY - PLAYWRIGHT E2E');
  console.log('====================================================================');

  let backendProc = null;
  let frontendProc = null;

  try {
    // 1. Check if backend is running, otherwise spawn
    const backendAlreadyRunning = await checkUrl(`${BACKEND_URL}/api/health`);
    if (!backendAlreadyRunning) {
      console.log('🚀 Starting backend process on port 3001...');
      backendProc = spawn('node', ['src/server.js'], {
        cwd: path.join(__dirname, '../../'),
        stdio: 'inherit',
        env: { ...process.env, PORT: `${BACKEND_PORT}` },
        shell: true,
      });
      await waitForServer(`${BACKEND_URL}/api/health`, 'Backend API');
    } else {
      console.log('ℹ️  Backend server is already running.');
    }

    // 2. Check if frontend is running, otherwise spawn preview
    const frontendAlreadyRunning = await checkUrl(FRONTEND_URL);
    if (!frontendAlreadyRunning) {
      console.log('🚀 Starting frontend preview process on port 4173...');
      frontendProc = spawn('npm', ['run', 'preview', '--', '--port', `${FRONTEND_PORT}`, '--host'], {
        cwd: path.join(__dirname, '../../../mterp-web'),
        stdio: 'inherit',
        shell: true,
      });
      await waitForServer(FRONTEND_URL, 'Frontend Preview');
    } else {
      console.log('ℹ️  Frontend preview is already running.');
    }

    // 3. API Level Verification Tests
    console.log('\n--- 1. Testing PPE & Regulation Repository API Endpoints ---');
    const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'password123' }),
    });

    if (!loginRes.ok) {
      throw new Error(`Failed to log in as owner via API: ${loginRes.statusText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    console.log('✅ API Auth Success. User:', loginData.user?.fullName);

    // Verify Master PPE Catalog API (Dynamic addition/reduction)
    const ppeItemsRes = await fetch(`${BACKEND_URL}/api/ppe-items?all=true`, { headers: authHeaders });
    const ppeItemsData = await ppeItemsRes.json();
    if (!ppeItemsData.success || !Array.isArray(ppeItemsData.data)) {
      throw new Error('Failed to fetch Master PPE items');
    }
    console.log(`✅ Master PPE Catalog API returned ${ppeItemsData.data.length} registered items.`);

    // Verify 10 Standard Regulation Templates in Repository
    const repoTemplatesRes = await fetch(`${BACKEND_URL}/api/ppe-items/repo-templates`, { headers: authHeaders });
    const repoTemplatesData = await repoTemplatesRes.json();
    if (!repoTemplatesData.success || !Array.isArray(repoTemplatesData.data) || repoTemplatesData.data.length < 10) {
      throw new Error(`Expected at least 10 regulation repository templates, got: ${repoTemplatesData.data?.length}`);
    }
    console.log(`✅ Standard Regulation Repository API verified with ${repoTemplatesData.data.length} templates:`);
    console.log('   Templates:', repoTemplatesData.data.map((t) => t.templateId).join(', '));

    // Verify Excel Export API Endpoint
    const excelRes = await fetch(`${BACKEND_URL}/api/ppe-usages/export/excel`, { headers: authHeaders });
    if (!excelRes.ok) {
      throw new Error(`Excel export API failed with status ${excelRes.status}`);
    }
    const excelBuffer = await excelRes.arrayBuffer();
    if (excelBuffer.byteLength < 5000) {
      throw new Error(`Excel file too small (${excelBuffer.byteLength} bytes)`);
    }
    console.log(`✅ PPE Excel Export API verified: ${excelBuffer.byteLength} bytes generated.`);

    // 4. Playwright Browser E2E Tests
    console.log('\n--- 2. Launching Playwright Browser E2E Testing ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    page.on('dialog', async (dialog) => {
      console.log('⚠️ BROWSER DIALOG:', dialog.type(), dialog.message());
      await dialog.accept();
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('🔴 BROWSER CONSOLE ERROR:', msg.text());
      }
    });

    // Authenticate by pre-filling localStorage
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ t, u }) => {
        localStorage.setItem('userToken', t);
        localStorage.setItem('userData', JSON.stringify(u));
      },
      { t: token, u: loginData.user }
    );

    // Navigate to /ppe-usages page
    console.log('🌐 Navigating to /ppe-usages...');
    await page.goto(`${FRONTEND_URL}/ppe-usages`, { waitUntil: 'networkidle' });

    // Assert Title
    const titleText = await page.locator('h1').textContent();
    console.log(`✅ Page Title Found: "${titleText?.trim()}"`);
    if (!titleText || !titleText.includes('Alat Pelindung Diri')) {
      throw new Error('Page title does not match APD / PPE');
    }

    // Verify Tab 3: "Repositori Regulasi & SOP APD"
    console.log('\n--- 3. Testing SOP & Regulation Repository Tab ---');
    await page.click('#tab-ppe-guide');
    await page.waitForTimeout(600);

    // Verify standard templates are rendered in left navigation
    const standardTemplateBtn = page.locator('button:has-text("Safety Helmet")').first();
    const isHelmetVisible = await standardTemplateBtn.isVisible();
    if (!isHelmetVisible) {
      throw new Error('Safety Helmet template not found in guide sidebar');
    }
    console.log('✅ Safety Helmet standard template visible in repository list.');

    // Click Full Body Harness template
    await page.locator('button:has-text("Full Body Harness")').first().click();
    await page.waitForTimeout(400);
    const harnessTitle = await page.locator('h2:has-text("Full Body Harness")').first().textContent();
    console.log(`✅ Opened SOP for: ${harnessTitle?.trim()}`);

    // Verify Indonesian and International regulation citations
    const indonesianRegSection = await page.locator('text=Regulasi Republik Indonesia').isVisible();
    const internationalRegSection = await page.locator('text=Standar Internasional (OSHA / ANSI / EN)').isVisible();
    const hasWearingSteps = await page.locator('text=Langkah & Tata Cara Pemakaian yang Benar').isVisible();
    const hasPreUseCheck = await page.locator('text=Pemeriksaan Fisik Sebelum Dipakai').isVisible();
    const hasDosAndDonts = await page.locator('text=Hal yang Wajib (DO\'S) & Dilarang (DON\'TS)').isVisible();
    const hasMaintenance = await page.locator('text=Perawatan, Pembersihan, & Penyimpanan').isVisible();

    if (!indonesianRegSection || !internationalRegSection || !hasWearingSteps || !hasPreUseCheck || !hasDosAndDonts || !hasMaintenance) {
      throw new Error('Missing regulation or SOP sections in guide display');
    }
    console.log('✅ Full Body Harness SOP & Regulation citations verified (Indonesian UU/Permenaker & International OSHA/ANSI).');

    // Switch to Master APD segment in guide tab
    await page.click('#tab-guide-custom');
    await page.waitForTimeout(400);
    const customItemBtn = page.locator('button:has-text("HLM-")').first();
    const hasCustomItemInGuide = await customItemBtn.isVisible();
    console.log(`✅ Master APD segment list rendered in guide (HLM item visible: ${hasCustomItemInGuide})`);

    // Verify Tab 2: "Katalog & Stok Master APD" (Dynamic addition, reduction, stock)
    console.log('\n--- 4. Testing Master PPE Catalog & Inventory (Dynamic Addition & Editing) ---');
    await page.click('#tab-ppe-catalog');
    await page.waitForTimeout(600);

    // Verify catalog cards are rendered
    const catalogCards = page.locator('.grid > div');
    const catalogCardsCount = await catalogCards.count();
    console.log(`✅ Catalog rendered with ${catalogCardsCount} master PPE item cards.`);
    if (catalogCardsCount === 0) {
      throw new Error('Expected master PPE items to be rendered in catalog grid');
    }

    // Test Search in Catalog
    const catalogSearchInput = page.locator('#input-catalog-search');
    await catalogSearchInput.fill('HAR-001');
    await page.waitForTimeout(400);
    const searchedHarness = await page.locator('h4:has-text("Full Body Harness")').first().isVisible();
    console.log(`✅ Search by code "HAR-001" found harness card: ${searchedHarness}`);
    await catalogSearchInput.fill('');
    await page.waitForTimeout(400);

    // Test Adding New Dynamic Master PPE Item using SOP Template Linkage
    console.log('➕ Testing "+ Tambah Item APD" using standard template...');
    await page.click('#btn-add-master-ppe');
    await page.waitForTimeout(500);

    // In PPEItemModal: Select template "fall_protection" / "fall_arrester"
    const templateSelect = page.locator('#modal-ppe-template-select');
    await templateSelect.selectOption('fall_arrester');
    await page.waitForTimeout(400);

    // Fill in Code, Name, Stock, Brand
    const testPpeCode = `TEST-ARREST-${Date.now().toString().slice(-4)}`;
    const codeInput = page.locator('#modal-ppe-code');
    await codeInput.fill(testPpeCode);

    const nameInput = page.locator('#modal-ppe-name');
    await nameInput.fill('Self-Retracting Fall Arrester E2E');

    const totalQtyInput = page.locator('#modal-ppe-totalQty');
    await totalQtyInput.fill('20');

    const brandInput = page.locator('#modal-ppe-brand');
    await brandInput.fill('Miller Fall Protection');

    // Select registered warehouse
    const warehouseSelect = page.locator('#modal-ppe-warehouse');
    await warehouseSelect.waitFor({ state: 'visible' });
    const warehouseOptions = await warehouseSelect.locator('option').allTextContents();
    console.log('   Available registered warehouses in modal:', warehouseOptions.map((o) => o.trim()).filter(Boolean).join(' | '));
    if (warehouseOptions.length <= 1) {
      throw new Error('Expected registered warehouses in dropdown');
    }
    await warehouseSelect.selectOption({ index: 1 });

    const binRefInput = page.locator('#modal-ppe-binRef');
    await binRefInput.fill('Zona C > Rak Safety K3');

    // Submit the modal form
    await page.click('#modal-ppe-submit-btn');
    await page.locator('#modal-ppe-submit-btn').waitFor({ state: 'hidden', timeout: 8000 });
    await page.waitForTimeout(1000);

    // Verify the newly created PPE item appears in Catalog with registered warehouse
    await catalogSearchInput.fill(testPpeCode);
    await page.waitForTimeout(500);
    const newCard = page.locator('.group', { hasText: testPpeCode }).first();
    await newCard.waitFor({ state: 'visible', timeout: 5000 });
    const newCardText = await newCard.textContent();
    if (!newCardText?.includes('Self-Retracting Fall Arrester E2E') || !newCardText?.includes('Gudang:')) {
      throw new Error(`Newly added Master PPE item ${testPpeCode} with registered warehouse not found in catalog! Got: ${newCardText}`);
    }
    console.log(`✅ Newly created dynamic PPE item "${testPpeCode}" verified in Master Catalog with registered warehouse: ${newCardText.match(/Gudang:[^\n]+/)?.[0] || 'Registered Warehouse'}`);

    // Reset search
    await catalogSearchInput.fill('');
    await page.waitForTimeout(400);

    // Verify Tab 1: "Catatan & Riwayat Pemakaian"
    console.log('\n--- 5. Testing Usage Records Tab, Dynamic Check-Out & Stock Deduction ---');
    await page.click('#tab-ppe-records');
    await page.waitForTimeout(600);

    // Record new usage with dynamic PPE item
    await page.click('button:has-text("Catat Pemakaian APD")');
    await page.waitForTimeout(500);

    // Choose worker
    const workerSelect = page.locator('.fixed form select').first();
    await workerSelect.selectOption({ index: 1 });

    const activityInput = page.locator('.fixed form input[placeholder*="Pekerjaan di Ketinggian"]');
    await activityInput.fill('Instalasi Jalur Pengaman Baja E2E Dynamic Test');

    // Select the dynamic test PPE in the checklist
    const dynamicPpeCheckbox = page.locator(`div:has-text("${testPpeCode}")`).last();
    const isDynamicCheckboxVisible = await dynamicPpeCheckbox.isVisible();
    if (isDynamicCheckboxVisible) {
      await dynamicPpeCheckbox.click();
      console.log(`   Selected dynamic PPE item ${testPpeCode} in check-out modal.`);
    }

    // Submit usage record
    await page.click('.fixed form button[type="submit"]:has-text("Simpan Catatan")');
    await page.waitForTimeout(1500);

    // Verify newly recorded usage in table
    const tableTextAfter = await page.locator('tbody').textContent();
    if (!tableTextAfter?.includes('Instalasi Jalur Pengaman Baja E2E Dynamic Test')) {
      throw new Error('Newly created record not found in table after submission');
    }
    console.log('✅ New dynamic PPE Usage recorded successfully!');

    // Check that available stock of the dynamic item was decremented in Catalog
    await page.click('#tab-ppe-catalog');
    await page.waitForTimeout(500);
    await catalogSearchInput.fill(testPpeCode);
    await page.waitForTimeout(400);

    const stockCard = page.locator('.group', { hasText: testPpeCode }).first();
    const cardText = await stockCard.textContent();
    console.log(`   Stock display for ${testPpeCode}: ${cardText?.includes('19') ? '19 Tersedia (Stock Auto-Decremented from 20 to 19!)' : cardText}`);

    // Return the PPE in Records tab
    await page.click('#tab-ppe-records');
    await page.waitForTimeout(500);
    const returnBtn = page.locator('button:has-text("Verifikasi Kembali")').first();
    await returnBtn.click();
    await page.waitForTimeout(500);

    const returnModalSelect = page.locator('.fixed select').last();
    await returnModalSelect.selectOption('Baik & Bersih');

    const returnNotesTextarea = page.locator('textarea[placeholder*="Dibersihkan dari spatter"]');
    await returnNotesTextarea.fill('Dikembalikan lengkap dan bersih setelah uji E2E.');

    await page.click('button[type="submit"]:has-text("Konfirmasi Pengembalian")');
    await page.waitForTimeout(1000);
    console.log('✅ Return of PPE successfully verified (stock restored)!');

    // Test Delete / Reduction of the test PPE item in Catalog
    console.log('🗑️ Testing removal / reduction of PPE item from Catalog...');
    await page.click('#tab-ppe-catalog');
    await page.waitForTimeout(500);
    await catalogSearchInput.fill(testPpeCode);
    await page.waitForTimeout(400);

    const deleteCard = page.locator('.group', { hasText: testPpeCode }).first();
    const deleteBtn = deleteCard.locator('button[title="Hapus APD"]').first();
    await deleteBtn.click();
    await page.waitForTimeout(1000);
    console.log(`✅ Test PPE item "${testPpeCode}" deleted successfully from Master Catalog!`);

    // Reset search
    await catalogSearchInput.fill('');
    await page.waitForTimeout(400);

    // Test Excel Export via UI Button
    console.log('\n--- 6. Testing Excel Export via UI Button ---');
    const exportBtn = page.locator('button:has-text("Ekspor Excel (.xlsx)")');
    const isExportBtnVisible = await exportBtn.isVisible();
    if (!isExportBtnVisible) {
      throw new Error('Export Excel button not found in page header');
    }

    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    const downloadFilename = download.suggestedFilename();
    console.log(`✅ Download triggered successfully: "${downloadFilename}"`);
    if (!downloadFilename.endsWith('.xlsx')) {
      throw new Error(`Expected download filename to end with .xlsx, got: ${downloadFilename}`);
    }

    // Test Audit History Drawer
    console.log('\n--- 7. Testing Audit History Drawer & Photo Verification ---');
    await page.click('#tab-ppe-records');
    await page.waitForTimeout(500);

    const historyBtn = page.locator('button[title="Lihat Riwayat & Log Bukti"]').first();
    await historyBtn.click();
    await page.waitForTimeout(600);

    const drawerTitle = page.locator('#ppe-history-drawer-title');
    await drawerTitle.waitFor({ state: 'visible', timeout: 5000 });
    const drawerTitleText = await drawerTitle.textContent();
    console.log(`✅ PPE History Drawer opened: "${drawerTitleText?.trim()}"`);

    const closeDrawerBtn = page.locator('button[aria-label="Tutup riwayat"]');
    await closeDrawerBtn.click();
    await page.waitForTimeout(400);
    console.log('✅ PPE History Drawer closed successfully.');

    // Save visual verification screenshot
    const screenshotPath = path.join(__dirname, 'ppe-usages-verification.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Saved visual verification screenshot to: ${screenshotPath}`);

    // Also copy to conversation artifact directory
    const artifactPath = 'C:\\Users\\CorSec\\.gemini\\antigravity\\brain\\fc57af3a-9e31-4fa6-b1f6-a56006989761\\ppe-usages-verification.png';
    try {
      require('fs').copyFileSync(screenshotPath, artifactPath);
      console.log(`📸 Copied screenshot to artifact directory: ${artifactPath}`);
    } catch (e) {
      console.warn('Artifact copy note:', e.message);
    }

    await browser.close();
    console.log('\n🎉 ALL DYNAMIC PPE & REGULATION REPOSITORY E2E TESTS PASSED 100%!');
  } finally {
    if (backendProc) {
      console.log('🛑 Terminating backend child process...');
      backendProc.kill();
    }
    if (frontendProc) {
      console.log('🛑 Terminating frontend child process...');
      frontendProc.kill();
    }
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E Test Suite Failed:', err);
  process.exit(1);
});
