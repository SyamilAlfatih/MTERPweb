# MTERP — Enterprise ERP Architectural Remediation Plan
**Target Audience:** Junior Developers & AI Coding Agents (Execution-Ready Specification)  
**Baseline Commit:** `281878a0`  
**Objective:** Refactor MTERP from a low-cohesion monolithic codebase (0.05–0.12 cohesion) into a modular, high-cohesion (>0.35), Single-Source-of-Truth (SSOT) Enterprise Resource Planning (ERP) architecture with zero regression.

---

## ⚠️ GLOBAL EXECUTION RULES (READ BEFORE STARTING)
If you are an AI agent or Junior Developer executing this plan, you **MUST** obey these 5 rules at all times:
1. **ONE STEP AT A TIME:** Execute only one numbered sub-task (e.g., `Task 1.1`) per commit/PR. Do not combine phases.
2. **NO API CONTRACT BREAKAGE:** Never change the URL path, HTTP method, request body keys, or JSON response keys of any Express route. The frontend and backend must remain 100% compatible after every single step.
3. **PRESERVE ACID TRANSACTIONS:** Whenever moving backend database logic into a Service class, you **MUST** pass the Mongoose `session` object into every `.save({ session })`, `.create([doc], { session })`, `.findOneAndUpdate(..., { session })`, and `.deleteOne(..., { session })` call via `withTransaction()`.
4. **VERIFY AFTER EVERY STEP:** After completing each sub-task, run:
   - Frontend: `cd mterp-web && npm run build && npm run lint`
   - Backend: `cd mterp-backend && node --check src/server.js`
5. **DELETE DEAD CODE IMMEDIATELY:** When a local function or local TypeScript interface is replaced by a centralized import, delete the local definition in the same edit so no unused variables remain.

---

## PHASE 1: Shared Kernel & Single Source of Truth (SSOT)
**Goal:** Eliminate financial calculation drift, duplicate currency formatters, duplicate date helpers, and duplicate PDF QR seal generators across the frontend.

---

### Task 1.1: Centralize Currency Formatting (`currency.ts`)
Currently, 9 different files define their own Rupiah formatting functions (`formatRupiah`, `formatRp`, `fmtRp`, `formatCurrency`).

#### Step 1: Create `mterp-web/src/utils/currency.ts`
Create this exact file and export these canonical functions:
```typescript
/**
 * Canonical ERP Currency Formatter (Indonesian Rupiah - IDR)
 * Single Source of Truth for all financial displays and PDF exports.
 */

export function formatRupiah(amount: number | string | null | undefined, includePrefix = true): string {
  const num = Number(amount);
  if (isNaN(num) || amount === null || amount === undefined) {
    return includePrefix ? 'Rp 0' : '0';
  }
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(num));

  return includePrefix ? `Rp ${formatted}` : formatted;
}

export function formatRupiahCompact(amount: number | null | undefined): string {
  const num = Number(amount || 0);
  if (isNaN(num)) return 'Rp 0';
  if (Math.abs(num) >= 1_000_000_000) {
    return `Rp ${(num / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `Rp ${(num / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  }
  return formatRupiah(num);
}

export function formatRupiahDots(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function stripDots(val: string): number {
  const cleaned = String(val || '').replace(/\./g, '').replace(/\D/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}
```

#### Step 2: Replace Local Currency Functions in Target Files
In each file below, **delete** the local currency function definition and **import** `formatRupiah` (aliased if necessary, or rename calls) from `@/utils/currency` (or relative path `../utils/currency`):
1. `mterp-web/src/pages/Materials.tsx` -> Delete local `formatRupiah()`, import `{ formatRupiah } from '../utils/currency'`.
2. `mterp-web/src/utils/exportProcurementPdf.ts` -> Delete local `formatRupiah()`, import `{ formatRupiah } from './currency'`.
3. `mterp-web/src/components/gantt/ResourceSheetView.tsx` -> Delete local `fmtRp()`, replace calls with `formatRupiah` from `../../utils/currency`.
4. `mterp-web/src/pages/SlipGaji.tsx` -> Delete local `formatRp()`, replace calls with `formatRupiah` from `../utils/currency`.
5. `mterp-web/src/pages/Dashboard.tsx` -> Delete local `formatCurrency()`, replace calls with `formatRupiah` from `../utils/currency`.
6. `mterp-web/src/pages/ProjectDetail.tsx` -> Delete local `formatRupiah()`, import `{ formatRupiah } from '../utils/currency'`.
7. `mterp-web/src/pages/MyPayments.tsx` -> Delete local `formatRp()`, replace calls with `formatRupiah` from `../utils/currency`.
8. `mterp-web/src/pages/ProjectReports.tsx` -> Delete local `formatRupiah()`, import `{ formatRupiah } from '../utils/currency'`.
9. `mterp-web/src/utils/exportSlipPdf.ts` -> Delete local `fmtRp()`, replace calls with `formatRupiah` from `./currency`.
10. `mterp-web/src/components/shared/CostInput.tsx` -> Re-export `formatRupiahDots` and `stripDots` from `../../utils/currency` so existing consumers don't break.

---

### Task 1.2: Unify Project Cost & Time-Window Engine (`projectCostEngine.ts`)
Currently, `DailyReport.tsx`, `ProjectDetail.tsx`, and `ProjectReports.tsx` all contain copy-pasted implementations of `costInDay()`, `costInMonth()`, `dayRange()`, and `monthRange()`.

#### Step 1: Create `mterp-web/src/utils/projectCostEngine.ts`
Move the canonical date-window and cost aggregation functions into `mterp-web/src/utils/projectCostEngine.ts`:
```typescript
import { wibDate } from './date';

export interface DateWindow {
  start: Date;
  end: Date;
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dayRange(dateStr: string): DateWindow {
  const base = wibDate(dateStr);
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function weekRange(mondayStr: string): DateWindow {
  const start = getMonday(wibDate(mondayStr));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function monthRange(monthStr: string): DateWindow {
  const [year, month] = monthStr.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function costInDay(item: { startDate?: string; endDate?: string; cost?: number; actualCost?: number }, dateStr: string): number {
  const { start, end } = dayRange(dateStr);
  const itemStart = item.startDate ? new Date(item.startDate) : null;
  const itemEnd = item.endDate ? new Date(item.endDate) : itemStart;
  if (!itemStart || !itemEnd) return 0;
  if (itemEnd < start || itemStart > end) return 0;
  const totalDays = Math.max(1, Math.ceil((itemEnd.getTime() - itemStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const baseCost = Number(item.actualCost ?? item.cost ?? 0);
  return baseCost / totalDays;
}

export function costInWeek(item: { startDate?: string; endDate?: string; cost?: number; actualCost?: number }, mondayStr: string): number {
  const { start } = weekRange(mondayStr);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    total += costInDay(item, iso);
  }
  return total;
}

export function costInMonth(item: { startDate?: string; endDate?: string; cost?: number; actualCost?: number }, monthStr: string): number {
  const { start, end } = monthRange(monthStr);
  let total = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    total += costInDay(item, iso);
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}
```
*(Note: Before deleting the local versions in `DailyReport.tsx`, `ProjectDetail.tsx`, and `ProjectReports.tsx`, compare their exact parameter signatures with the existing code in those 3 files and preserve any specific property accesses like `workItems` or `supplies` cost fields).*

#### Step 2: Replace in Target Files
1. `mterp-web/src/pages/DailyReport.tsx` -> Delete local `dayRange`, `monthRange`, `costInDay`, `costInMonth`. Import from `../utils/projectCostEngine`.
2. `mterp-web/src/pages/ProjectDetail.tsx` -> Delete local `getMonday`, `dayRange`, `weekRange`, `monthRange`, `costInDay`, `costInWeek`, `costInMonth`. Import from `../utils/projectCostEngine`.
3. `mterp-web/src/pages/ProjectReports.tsx` -> Delete local `dayRange`, `monthRange`, `costInDay`, `costInMonth`. Import from `../utils/projectCostEngine`.

---

### Task 1.3: Consolidate Date & Time Helpers (`date.ts`)
Eliminate scattered date formatting wrappers across pages and Gantt components.

#### Step 1: Add Missing Standard Formatters to `mterp-web/src/utils/date.ts`
Open `mterp-web/src/utils/date.ts` and add these exported helpers (if not already present):
```typescript
export function formatShortDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  return formatDate(dateInput, { day: '2-digit', month: 'short' });
}

export function formatDayDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  return formatDate(dateInput, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHours(h: number): string {
  if (!h || isNaN(h)) return '0h';
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function timeAgo(dateInput: string | Date): string {
  const diffSec = Math.floor((Date.now() - new Date(dateInput).getTime()) / 1000);
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}j lalu`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}h lalu`;
}
```

#### Step 2: Deduplicate in Consumer Files
1. `mterp-web/src/components/gantt/ResourceUsageView.tsx` & `mterp-web/src/components/gantt/TaskUsageView.tsx`:
   - Delete local `parseLocalDate()`, `toDateStr()`, and `formatHours()`.
   - Import `{ parseLocalDate, toDateStr, formatHours } from '../../utils/date'`.
2. `mterp-web/src/components/layout/AppLayout.tsx` & `mterp-web/src/pages/Notifications.tsx`:
   - Delete local `timeAgo()` in both files.
   - Import `{ timeAgo } from '@/utils/date'` (or relative path).
3. `mterp-web/src/pages/AttendanceLogs.tsx` & `mterp-web/src/pages/GroupAttendance.tsx`:
   - Delete local `getImageUrl()` in both files.
   - Import `{ getImageUrl } from '../utils/image'`.

---

### Task 1.4: Unify Document QR Seal & Image Loader (`documentSeal.ts`)
Currently, `exportProcurementPdf.ts`, `exportSlipPdf.ts`, and `ProjectReports.tsx` each implement their own Base64 image loader and QR Code canvas overlay generator.

#### Step 1: Create `mterp-web/src/utils/documentSeal.ts`
1. Extract `loadImageAsBase64(url: string): Promise<string | null>` and `generateQrSignatureSeal(payload: string, logoUrl?: string): Promise<string>` from `mterp-web/src/utils/exportProcurementPdf.ts` into `mterp-web/src/utils/documentSeal.ts`.
2. In `mterp-web/src/utils/exportProcurementPdf.ts`, delete the local implementations and import `{ loadImageAsBase64, generateQrSignatureSeal } from './documentSeal'`.
3. In `mterp-web/src/utils/exportSlipPdf.ts`, replace `loadImage()` and `buildSignatureQr()` with imports from `./documentSeal`.
4. In `mterp-web/src/pages/ProjectReports.tsx`, replace `loadImageAsBase64()` and `generateQrWithOverlay()` with imports from `../utils/documentSeal`.

---

## PHASE 2: Eliminate Shadow Types & Split Monolithic Frontend API
**Goal:** Ensure 100% TypeScript contract safety across the frontend and break up the 166-degree `api.ts` bottleneck.

---

### Task 2.1: Purge Local "Shadow Interfaces" in `src/pages/`
Junior developers previously re-declared interfaces locally inside page files instead of importing from `src/types/index.ts`.

#### Execution Checklist:
1. **Unify `AttendanceRecord`:**
   - Open `mterp-web/src/types/index.ts` and define a comprehensive `export interface AttendanceRecord` that includes all fields used across `Attendance.tsx`, `GroupAttendance.tsx`, `OfficeAttendance.tsx`, and `AttendanceLogs.tsx`.
   - Open those 4 page files, delete their local `interface AttendanceRecord`, and import `{ AttendanceRecord } from '../types'`.
2. **Unify `ProjectData` & `ProjectOption`:**
   - In `mterp-web/src/pages/ProjectTools.tsx` and `mterp-web/src/pages/DailyReport.tsx`, delete the local `interface ProjectData` and import `{ ProjectData } from '../types'`.
   - In `mterp-web/src/types/index.ts`, export `export type ProjectOption = Pick<ProjectData, '_id' | 'name' | 'location' | 'status'>;` and replace local `ProjectOption` definitions in `DailyReport.tsx`, `AttendanceLogs.tsx`, and `Tasks.tsx`.
3. **Unify `Supply`:**
   - In `mterp-web/src/pages/MaterialUsage.tsx` and `mterp-web/src/pages/ProjectMaterials.tsx`, delete local `interface Supply` and import `{ ProjectSupply as Supply } from '../types'` (ensuring `ProjectSupply` in `types/index.ts` has all required fields).
4. **Unify `UserOption` & `Worker`:**
   - In `mterp-web/src/types/index.ts`, export `export interface UserOption { _id: string; fullName: string; username?: string; role: string; profilePhoto?: string; dailyRate?: number; }`.
   - Delete local `interface UserOption` in `ProjectTools.tsx`, `AttendanceLogs.tsx`, and `Tasks.tsx`, and import `{ UserOption } from '../types'`.

---

### Task 2.2: Modularize `mterp-web/src/api/api.ts` (Facade Pattern)
`api.ts` has a degree of 166 because every single domain's API calls live in one file. We will split it by ERP domain **while keeping `api.ts` as a re-export facade** so zero existing imports break.

#### Step 1: Create Domain API Files inside `mterp-web/src/api/`
Create the following 6 files:
1. `mterp-web/src/api/client.ts` -> Move the `axios.create(...)` instance (`export const api = ...`) and request/response interceptors here.
2. `mterp-web/src/api/iam.api.ts` -> Move User CRUD, Role updates, Password resets, Excel/CSV user exports, Competency Certificates, Education proofs, API Key CRUD, and Master Approval Config functions here.
3. `mterp-web/src/api/projectPlan.api.ts` -> Move Gantt tasks, WBS indent/outdent/move, Predecessors, Baselines, Resources, Calendars, S-Curve, Earned Value, Critical Path, and XML/Excel plan export/import functions here.
4. `mterp-web/src/api/scm.api.ts` -> Move Material Requests (PR/PO/GRN), Supplier Comparisons, Procurement Config/Authorizers, Project Supplies, and Tools/Equipment functions here.
5. `mterp-web/src/api/swakelola.api.ts` -> Move RAB items and Local Purchase (`getProjectRAB`, `createProjectRABItem`, `updateProjectRABItem`, `getProjectLocalPurchases`, `createLocalPurchase`, `createBatchLocalPurchase`, `verifyLocalPurchase`) functions here.
6. `mterp-web/src/api/hcm.api.ts` -> Move Attendance Sessions, Tasks completion/reminders, and Notifications/Push Subscription functions here.

#### Step 2: Turn `mterp-web/src/api/api.ts` into a Barrel Re-Exporter
Replace the body of `mterp-web/src/api/api.ts` with:
```typescript
import { api } from './client';
export * from './client';
export * from './iam.api';
export * from './projectPlan.api';
export * from './scm.api';
export * from './swakelola.api';
export * from './hcm.api';
export default api;
```
**Verification:** Run `npm run build` in `mterp-web`. Every existing file importing from `../api/api` will continue to work with zero errors.

---

## PHASE 3: Backend Service Layer & Domain Decoupling
**Goal:** Extract business logic, image processing, Excel parsing, and cross-domain mutations out of Express route files (`projects.js`, `requests.js`, `spkl.js`, `localPurchases.js`) into testable ERP Domain Services.

---

### Task 3.1: Extract Shared Image Processor (`imageProcessor.js`)
Currently, `routes/projects.js`, `routes/tasks.js`, and `routes/attendanceSession.js` all import `sharp`, `fs`, and `path` directly to convert uploaded images to WebP.

#### Step 1: Create `mterp-backend/src/utils/imageProcessor.js`
1. Move `convertToWebP(filePath, options)` from `mterp-backend/src/routes/projects.js` into `mterp-backend/src/utils/imageProcessor.js`.
2. Add a helper `deleteLocalFile(relativePath)` (currently in `mterp-backend/src/routes/users.js`) to `mterp-backend/src/utils/imageProcessor.js`.
3. Update `routes/projects.js`, `routes/tasks.js`, `routes/attendanceSession.js`, and `routes/users.js` to import `{ convertToWebP, deleteLocalFile }` from `../utils/imageProcessor`.

---

### Task 3.2: De-Monolith `mterp-backend/src/routes/projects.js` (67 Degrees)
`routes/projects.js` is the largest file in the backend. It mixes Excel workbook parsing, project document uploads, supply CRUD, daily reports, and project CRUD.

#### Step 1: Extract `ProjectExcelService.js`
1. Create `mterp-backend/src/services/projectExcelService.js`.
2. Move `getCellValue()`, `sheetToJson()`, `addSheetData()`, and the Excel workbook generation/parsing logic out of `mterp-backend/src/routes/projects.js` into `projectExcelService.js`.
3. Remove `const ExcelJS = require('exceljs')` from `routes/projects.js` and call `projectExcelService` methods from the route handlers.

#### Step 2: Extract `authOrApiKey` Middleware
1. Move the `authOrApiKey(req, res, next)` function out of `mterp-backend/src/routes/projects.js` and into `mterp-backend/src/middleware/auth.js` (exporting it alongside `auth`, `authorize`, and `optionalAuth`).
2. Import `{ auth, authorize, authOrApiKey }` in `routes/projects.js`.

---

### Task 3.3: Encapsulate Cross-Domain Mutations (RAB Budget & Attendance Sync)
In an ERP, one domain route should not directly mutate another domain's collection without going through a domain service.

#### Step 1: Create `mterp-backend/src/services/rabBudgetService.js`
1. Centralize all `RABItem` budget lock checks and realization increments (currently scattered across `routes/localPurchases.js` (`handleVerifyPurchase`), `routes/requests.js`, and `routes/rab.js`).
2. Expose:
   - `validateAndReserveBudget({ projectId, rabItemId, amount, qty, session })`
   - `commitPurchaseToRabAndSupply({ purchase, verifierId, session })`
3. Update `routes/localPurchases.js` (`handleVerifyPurchase`) to call `rabBudgetService.commitPurchaseToRabAndSupply({ purchase, verifierId: req.user._id, session })` inside `withTransaction()`.

#### Step 2: Create `mterp-backend/src/services/overtimeAttendanceService.js`
1. Move `calculateEffectiveHours()`, `parseTimeToMinutes()`, `calculateOvertimePay()`, and `syncSpklToAttendance()` out of `mterp-backend/src/routes/spkl.js` into `mterp-backend/src/services/overtimeAttendanceService.js`.
2. Have `routes/spkl.js` import and call these methods.

---

## PHASE 4: Decompose Frontend "God Pages"
**Goal:** Break the 4 largest React files (`Materials.tsx`, `GroupAttendance.tsx`, `SlipGaji.tsx`, `Users.tsx`) into focused sub-components with cohesion > 0.35.

---

### Task 4.1: Decompose `Materials.tsx` (61 Degrees -> 4 Focused Components)
Create the directory `mterp-web/src/components/materials/` and extract the following sub-components from `mterp-web/src/pages/Materials.tsx`:
1. `ProcurementConfigModal.tsx` -> Extract the Procurement Authorizers & Threshold configuration modal (`getProcurementConfig`, `updateProcurementConfig`, `assignProcurementAuthorizers`).
2. `SupplierSourcingModal.tsx` -> Extract the Supplier Comparison matrix UI (`submitSupplierComparisons`, `ISupplierComparison`).
3. `MaterialRequestCreateModal.tsx` -> Extract the PR creation form (`createMaterialRequest`, `EMPTY_LINE_ITEM`).
4. `MaterialOrderReceiveModal.tsx` -> Extract the Goods Receipt (GRN) & signature pad modal (`receiveMaterialOrder`, `SignaturePad`).
5. Keep `mterp-web/src/pages/Materials.tsx` strictly as the container page managing the `PipelineTab` filter, list rendering, and active modal state.

---

### Task 4.2: Decompose `Users.tsx` (50 Degrees -> 3 Focused Components)
Create the directory `mterp-web/src/components/users/` (which already has `UserPortfolioModal.tsx` and `LiveDocumentViewer.tsx`) and extract:
1. `ApiKeyManagementModal.tsx` -> Extract the API Key list, creation, toggle, and deletion UI (`getApiKeys`, `createApiKey`, `updateApiKey`, `deleteApiKey`).
2. `UserImportExportBar.tsx` -> Extract the Excel/CSV export and bulk import template logic (`exportUsersExcel`, `exportUsersCsv`, `downloadImportTemplate`, `importUsers`).
3. Keep `mterp-web/src/pages/Users.tsx` focused on the user directory data grid and user edit/create modal.

---

### Task 4.3: Decompose `SlipGaji.tsx` (52 Degrees -> Role & Period Utilities + Sub-Views)
1. Create `mterp-web/src/utils/roleClassifier.ts` and move `isFieldRole()`, `isManagementRole()`, `isSupervisorRole()`, `getRoleBadge()`, `ROLE_BADGES`, and `PAYROLL_ALLOWED_ROLES` from `mterp-web/src/pages/SlipGaji.tsx` into it.
2. Create `mterp-web/src/components/payroll/SlipGajiDetailModal.tsx` to house the slip preview and PDF export trigger (`exportSlipToPdf`).

---

### Task 4.4: Encapsulate Offline Sync in `GroupAttendance.tsx` (54 Degrees)
Currently, `GroupAttendance.tsx`, `Attendance.tsx`, and `OfficeAttendance.tsx` each import 8 to 11 low-level functions directly from `attendanceSyncEngine.ts` (`cacheTodayAttendance`, `getCachedTodayAttendance`, `cacheAttendanceProjects`, `getCachedAttendanceProjects`, `fileToBase64`, `queueOfflineAttendance`, etc.).

1. Create `mterp-web/src/hooks/useAttendanceOfflineSync.ts`.
2. Wrap the project caching, today-attendance caching, and offline queueing into a single hook:
   ```typescript
   export function useAttendanceOfflineSync() {
     // Expose clean methods: loadProjectsWithFallback, loadTodayWithFallback, submitWithOfflineFallback
   }
   ```
3. Refactor `Attendance.tsx`, `GroupAttendance.tsx`, and `OfficeAttendance.tsx` to use `useAttendanceOfflineSync()` instead of importing 10 separate functions from `attendanceSyncEngine.ts`.

---

## PHASE 5: Graphify Corpus Hygiene & Dead-Code Cleanup
**Goal:** Reduce the 761 isolated nodes to < 10% and ensure future `graphify` runs only audit production runtime code.

---

### Task 5.1: Remove / Relocate Scratch Scripts & Configure `.graphifyignore`
1. Delete or move `mterp-backend/scratch/fix_projects.js` out of the repository root so it is not indexed as application code.
2. Create a `.graphifyignore` file in the root of `MTERPweb`:
   ```gitignore
   # Ignore documentation, AI skills, and one-off CLI migration scripts during architectural AST audits
   .agents/
   *.md
   mterp-backend/scratch/
   mterp-backend/src/scripts/
   mterp-backend/src/seed-slipgaji-clear.js
   dist/
   build/
   node_modules/
   ```

---

## ✅ FINAL ACCEPTANCE CRITERIA (DEFINITION OF DONE)
When all phases are complete, run `graphify update .` and verify the new `GRAPH_REPORT.md` meets these ERP benchmarks:
- [ ] **Import Cycles:** Remains at `0`.
- [ ] **Currency & Cost SSOT:** `formatRupiah` exists in exactly **1** file (`utils/currency.ts`), and `costInDay`/`costInMonth` exist in exactly **1** file (`utils/projectCostEngine.ts`).
- [ ] **No Shadow Types:** `AttendanceRecord`, `ProjectData`, `ProjectOption`, `UserOption`, and `Supply` are defined only once in `src/types/`.
- [ ] **God Node Reduction:** `api.ts`, `projects.js`, `Materials.tsx`, `GroupAttendance.tsx`, `SlipGaji.tsx`, and `Users.tsx` all drop below **35 degrees** each.
- [ ] **Community Cohesion:** Average cohesion of the top 15 code communities increases from **~0.09** to **> 0.30**.