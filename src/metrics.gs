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
    const tz = METRICS_CFG.TZ || 'America/New_York';
    const today = new Date();

    // --- Date range handling ---
    let start, end;
    switch (q.range) {
      case 'today':
        start = startOfDay_(today, tz);
        end = endOfDay_(today, tz);
        break;
      case 'yesterday':
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        start = startOfDay_(y, tz);
        end = endOfDay_(y, tz);
        break;
      case '7':
        start = new Date(today); start.setDate(today.getDate() - 7);
        start = startOfDay_(start, tz);
        end = endOfDay_(today, tz);
        break;
      case '30':
        start = new Date(today); start.setDate(today.getDate() - 30);
        start = startOfDay_(start, tz);
        end = endOfDay_(today, tz);
        break;
      case 'custom':
        start = q.start ? startOfDay_(new Date(q.start), tz) : null;
        end = q.end ? endOfDay_(new Date(q.end), tz) : null;
        if (!start || !end) throw new Error('Invalid custom date range.');
        break;
      default:
        throw new Error('Date range required.');
    }

    const statuses = Array.isArray(q.statuses) && q.statuses.length ? q.statuses : ['Any'];
    const out = [];

    vals.forEach(r => {
      const tsRaw = r[map['Timestamp']];
      const ts = parseDateSafe_(tsRaw);
      if (!ts) return;

      const tsLocal = new Date(Utilities.formatDate(ts, tz, 'yyyy-MM-dd\'T\'HH:mm:ss'));
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

      obj.status = computeStatus_(r, map, ts);
      if (statuses.includes('Any') || statuses.includes(obj.status)) out.push(obj);
    });

    Logger.log(`✅ searchOrderMetrics found ${out.length} rows.`);
    return { ok: true, rows: out };

  } catch (err) {
    Logger.log('❌ searchOrderMetrics failed: %s', err);
    return { ok: false, message: String(err) };
  }
}

// --- Helpers to bound days correctly in local TZ ---
function startOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T00:00:00`);
}
function endOfDay_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return new Date(`${s}T23:59:59`);
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