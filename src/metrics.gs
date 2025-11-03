/**
 * SPCA Pet Pantry — Order Metrics
 * --------------------------------
 * Backend for ui-metrics.html
 * Provides search and filter capability by date + status.
 */

const METRICS_CFG = {
  SHEET_ID: '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU', // main Pantry Form Responses sheet
  SHEET_NAME: 'Form Responses 1',
  TZ: Session.getScriptTimeZone(),
};

/**
 * Called by frontend via google.script.run
 * q = { range, statuses[], start, end }
 */
function searchOrderMetrics(q) {
  try {
    if (!q) throw new Error('Missing query object.');

    const ss = SpreadsheetApp.openById(METRICS_CFG.SHEET_ID);
    const sh = ss.getSheetByName(METRICS_CFG.SHEET_NAME);
    if (!sh) throw new Error('Sheet not found.');

    const vals = sh.getDataRange().getValues();
    const headers = vals.shift();
    const map = Object.fromEntries(headers.map((h, i) => [h, i]));
    const tz = 'America/New_York'; // Force Eastern
    const today = new Date();

    // --- Date range calculation ---
    const startEnd = calcRange_(q.range, q.start, q.end, tz);
    const start = startEnd.start;
    const end = startEnd.end;

    const statuses = Array.isArray(q.statuses) && q.statuses.length ? q.statuses : ['Any'];
    const out = [];

    vals.forEach(r => {
      const ts = parseDateSafe_(r[map['Timestamp']]);
      if (!ts) return;

      // Shift UTC → Eastern manually
      const tsLocal = convertToTZ_(ts, tz);
      if (tsLocal < start || tsLocal > end) return;

      const obj = {
        formId: String(r[map['FormID']] || ''),
        printed: r[map['Printed At']] || '',
        fulfilled: r[map['Fulfilled Date']] || r[map['Fulfilled At']] || '',
        notified: r[map['Notification Status']] || '',
        pickedUp: r[map['Picked-Up']] || '',
        restocked: r[map['Restocked']] || '',
        requestDate: Utilities.formatDate(tsLocal, tz, 'yyyy-MM-dd'),
        clientName: `${r[map['First Name']] || ''} ${r[map['Last Name']] || ''}`.trim(),
        phone: r[map['Phone Number']] || ''
      };

      obj.status = computeStatus_(r, map, tsLocal);
      if (statuses.includes('Any') || statuses.includes(obj.status)) out.push(obj);
    });

    Logger.log(`✅ searchOrderMetrics found ${out.length} rows.`);
    return { ok: true, rows: out };

  } catch (err) {
    Logger.log('❌ searchOrderMetrics failed: %s', err);
    return { ok: false, message: String(err) };
  }
}

/* --- Helper functions --- */

function calcRange_(range, startInput, endInput, tz) {
  const today = new Date();
  const start = new Date();
  const end = new Date();
  switch (range) {
    case 'today':
      return { start: startOfDay_(today, tz), end: endOfDay_(today, tz) };
    case 'yesterday':
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { start: startOfDay_(y, tz), end: endOfDay_(y, tz) };
    case '7':
      const s7 = new Date(today);
      s7.setDate(today.getDate() - 7);
      return { start: startOfDay_(s7, tz), end: endOfDay_(today, tz) };
    case '30':
      const s30 = new Date(today);
      s30.setDate(today.getDate() - 30);
      return { start: startOfDay_(s30, tz), end: endOfDay_(today, tz) };
    case 'custom':
      const s = startInput ? startOfDay_(new Date(startInput), tz) : null;
      const e = endInput ? endOfDay_(new Date(endInput), tz) : null;
      if (!s || !e) throw new Error('Invalid custom date range.');
      return { start: s, end: e };
    default:
      throw new Error('Invalid range.');
  }
}

function startOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T00:00:00`);
}
function endOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T23:59:59`);
}

// 🔹 Explicitly shift Date object from UTC to target timezone
function convertToTZ_(date, tz) {
  const iso = Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(iso);
}

function parseDateSafe_(v) {
  try {
    if (v instanceof Date && !isNaN(v)) return v;
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  } catch (_) { return null; }
}

/* --- Helper functions --- */

function calcRange_(range, startInput, endInput, tz) {
  const today = new Date();
  const start = new Date();
  const end = new Date();
  switch (range) {
    case 'today':
      return { start: startOfDay_(today, tz), end: endOfDay_(today, tz) };
    case 'yesterday':
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { start: startOfDay_(y, tz), end: endOfDay_(y, tz) };
    case '7':
      const s7 = new Date(today);
      s7.setDate(today.getDate() - 7);
      return { start: startOfDay_(s7, tz), end: endOfDay_(today, tz) };
    case '30':
      const s30 = new Date(today);
      s30.setDate(today.getDate() - 30);
      return { start: startOfDay_(s30, tz), end: endOfDay_(today, tz) };
    case 'custom':
      const s = startInput ? startOfDay_(new Date(startInput), tz) : null;
      const e = endInput ? endOfDay_(new Date(endInput), tz) : null;
      if (!s || !e) throw new Error('Invalid custom date range.');
      return { start: s, end: e };
    default:
      throw new Error('Invalid range.');
  }
}

function startOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T00:00:00`);
}
function endOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T23:59:59`);
}

// 🔹 Explicitly shift Date object from UTC to target timezone
function convertToTZ_(date, tz) {
  const iso = Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(iso);
}

function parseDateSafe_(v) {
  try {
    if (v instanceof Date && !isNaN(v)) return v;
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  } catch (_) { return null; }
}

/* ---------- Helpers ---------- */

function computeStatus_(r, map, ts) {
  const gen = r[map['Generated At']] || '';
  const printed = r[map['Printed At']] || '';
  const fulfilled = r[map['Fulfilled Date']] || r[map['Fulfilled At']] || '';
  const notified = r[map['Notification Status']] || '';
  const picked = r[map['Picked-Up']] || '';
  const restocked = r[map['Restocked']] || '';

  const now = new Date();
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(now.getDate() - 10);

  if (restocked) return 'Restocked';
  if (picked) return 'Picked Up';
  if (fulfilled && !notified) return 'Filled - Not Notified';
  if (fulfilled && !picked && notified === 'Notified') return 'Awaiting Pick-up';
  if (fulfilled && notified && picked) return 'Picked Up';
  if (gen && printed && !fulfilled) return 'In Progress';
  if (gen && !printed) return 'Not Printed';
  if (!picked && ts < tenDaysAgo) return 'Expired';
  return 'Unknown';
}

function parseDateSafe_(v) {
  try {
    if (v instanceof Date && !isNaN(v)) return v;
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  } catch (_) { return null; }
}

function safeStr(v) {
  return v == null ? '' : String(v).trim();
}