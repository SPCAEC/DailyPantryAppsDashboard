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
 * Called by frontend.
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

    // --- Date filters ---
    const today = new Date();
    const tz = METRICS_CFG.TZ;

    let start, end;
    switch (q.range) {
      case 'today':
        start = new Date(today); start.setHours(0,0,0,0);
        end = new Date(today); end.setHours(23,59,59,999);
        break;
      case 'yesterday':
        start = new Date(today); start.setDate(today.getDate() - 1); start.setHours(0,0,0,0);
        end = new Date(today); end.setDate(today.getDate() - 1); end.setHours(23,59,59,999);
        break;
      case '7':
        start = new Date(today); start.setDate(today.getDate() - 7); start.setHours(0,0,0,0);
        end = new Date(today); end.setHours(23,59,59,999);
        break;
      case '30':
        start = new Date(today); start.setDate(today.getDate() - 30); start.setHours(0,0,0,0);
        end = new Date(today); end.setHours(23,59,59,999);
        break;
      case 'custom':
        start = q.start ? new Date(q.start) : null;
        end = q.end ? new Date(q.end) : null;
        if (!start || !end) throw new Error('Invalid custom date range.');
        end.setHours(23,59,59,999);
        break;
      default:
        throw new Error('Date range is required.');
    }

    const statuses = Array.isArray(q.statuses) ? q.statuses : ['Any'];
    const out = [];

    vals.forEach(r => {
      const ts = parseDateSafe_(r[map['Timestamp']]);
      if (!ts || ts < start || ts > end) return;

      const obj = {
        formId: String(r[map['FormID']] || ''),
        printed: r[map['Printed At']] || '',
        fulfilled: r[map['Fulfilled Date']] || r[map['Fulfilled At']] || '',
        notified: r[map['Notification Status']] || '',
        pickedUp: r[map['Picked-Up']] || '',
        restocked: r[map['Restocked']] || '',
        requestDate: Utilities.formatDate(ts, tz, 'yyyy-MM-dd'),
        clientName: `${r[map['First Name']] || ''} ${r[map['Last Name']] || ''}`.trim(),
        phone: r[map['Phone Number']] || ''
      };

      // --- Determine status ---
      obj.status = computeStatus_(r, map, ts);

      // --- Apply status filter ---
      if (statuses.includes('Any') || statuses.includes(obj.status)) {
        out.push(obj);
      }
    });

    Logger.log(`✅ searchOrderMetrics found ${out.length} rows.`);
    return { ok: true, rows: out };

  } catch (err) {
    Logger.log('❌ searchOrderMetrics failed: %s', err);
    return { ok: false, message: String(err) };
  }
}

/* --- Helpers --- */

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