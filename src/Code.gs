/** SPCA Pet Pantry — Print & Archive (Core Backend)
 * Core entry + shared utilities
 *  - Global config
 *  - Generator bridge
 *  - doGet() (web app entry)
 *  - Merge API helper (used by grab, reprint, etc.)
 *  - Common internal helpers
 *
 * All feature-specific logic now lives in:
 *   • grab.gs      → Daily flow (list, merge, archive)
 *   • recreate.gs  → Recreate forms by date or row range
 *   • reprint.gs   → Search + merge archived PDFs
 */

/* ===== Config ===== */

const PA_CONFIG = {
  COMPLETED_FOLDER_ID: '1ccWalGXHxLJVN-G92GTzv8OIF_rHq7QO',
  ARCHIVE_FOLDER_ID:   '1IWY9IQVQvZa42vq6XluLMDkG7Bv-Sajp',
  MERGE_SERVICE_URL:   'https://pdf-merge-service.onrender.com',
  MAX_FILES: 250,
  MAX_TOTAL_BYTES: 45 * 1024 * 1024 // ~45 MB
};

const GEN_BRIDGE = {
  SOURCE_SHEET_ID: '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU',
  RESPONSE_SHEET_NAME: 'Form Responses 1'
};

/* ===== Generator Library Resolution ===== */

function _getGenLib_() {
  try {
    if (typeof PantryGen !== 'undefined') return PantryGen;
    if (typeof Generator !== 'undefined') return Generator;
    if (typeof Gen !== 'undefined') return Gen;
    if (typeof PPGen !== 'undefined') return PPGen;
    return null;
  } catch (_) { return null; }
}

function _hasGenerator_() {
  const L = _getGenLib_();
  try { return !!(L && typeof L.generateOrderFormByRow === 'function'); }
  catch (_) { return false; }
}

/* ===== Web App Entry ===== */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('SPCA Pet Pantry • Print & Archive')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ===== Shared: Flexible Merge Service Caller ===== */

function _callMergeFlexible_(payloadFiles) {
  const base = String(PA_CONFIG.MERGE_SERVICE_URL || '').replace(/\/+$/, '');
  const url = base + '/merge';
  const payload = JSON.stringify({
    outputName:
      'Merged_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
      '.pdf',
    files: payloadFiles
  });

  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload,
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json, application/pdf' }
    });
  } catch (e) {
    return { ok: false, message: 'Merge service unreachable: ' + e };
  }

  const code = res.getResponseCode();
  const ct = (res.getHeaders()['Content-Type'] || '').toLowerCase();
  Logger.log('Merge response %s %s', code, ct);

  if (code < 200 || code >= 300)
    return { ok: false, message: `Merge error ${code}: ${safeText_(res).slice(0, 200)}` };

  try {
    if (ct.includes('json')) {
      const data = JSON.parse(res.getContentText());
      if (data && data.contentBase64) return { ok: true, base64: data.contentBase64 };
    }
    const b64 = Utilities.base64Encode(res.getBlob().getBytes());
    if (b64.startsWith('JVBERi0')) return { ok: true, base64: b64 };
    return { ok: false, message: 'Unexpected merge response type.' };
  } catch (e) {
    return { ok: false, message: 'Merge parse error: ' + e };
  }
}

/* ===== Shared Internals (used across sub-modules) ===== */

function safeText_(res) {
  try { return res.getContentText(); } catch (_) { return '<non-text response>'; }
}

function _getResponseSheet_() {
  let sourceId = GEN_BRIDGE.SOURCE_SHEET_ID, sheetName = GEN_BRIDGE.RESPONSE_SHEET_NAME;
  try {
    const L = _getGenLib_();
    if (L && typeof L.getSourceSheetMeta === 'function') {
      const meta = L.getSourceSheetMeta();
      if (meta && meta.sourceSheetId && meta.responseSheetName) {
        sourceId = meta.sourceSheetId;
        sheetName = meta.responseSheetName;
      }
    }
  } catch (_) {}
  const ss = SpreadsheetApp.openById(sourceId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet "${sheetName}" not found`);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  return { ss, sh, headers };
}

function _parseISODateStart_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(m[1], m[2] - 1, m[3]);
}

function _parseISODateEndExclusive_(iso) {
  const d = _parseISODateStart_(iso);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

function _toDateSafe_(v) {
  try {
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return v;
    const d = new Date(String(v));
    return isNaN(d) ? null : d;
  } catch (_) { return null; }
}

/* ===== Safe Exports ===== */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : this;
  // Core exports only; feature modules handle their own
  g._callMergeFlexible_ = _callMergeFlexible_;
  g._getGenLib_ = _getGenLib_;
  g._hasGenerator_ = _hasGenerator_;
  g._getResponseSheet_ = _getResponseSheet_;
})();

function loadUIFile(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}