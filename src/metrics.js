/** SPCA Pet Pantry — Form Metrics
 * Provides order status filtering and date-based reporting.
 */

function searchOrderMetrics(filters) {
  try {
    const ss = SpreadsheetApp.openById(PA_CONFIG.SOURCE_SHEET_ID);
    const sh = ss.getSheetByName(PA_CONFIG.RESPONSE_SHEET_NAME);
    const data = sh.getDataRange().getValues();
    const headers = data.shift();

    const map = Object.fromEntries(headers.map((h, i) => [h, i]));

    const start = parseDateSafe_(filters.start);
    const end = parseDateSafe_(filters.end);
    if (!start || !end) throw new Error('Start and End date required.');
    end.setHours(23, 59, 59, 999);

    const selectedStatuses = Array.isArray(filters.statuses) && filters.statuses.length 
      ? filters.statuses 
      : ['Any'];

    const results = [];
    const now = new Date();

    for (const row of data) {
      const ts = parseDateSafe_(row[map['Timestamp']]);
      if (!ts || ts < start || ts > end) continue;

      const formId = row[map['FormID']];
      const first = row[map['First Name']] || '';
      const last = row[map['Last Name']] || '';
      const name = `${first} ${last}`.trim();
      const phone = row[map['Phone Number']] || '';

      const generated = row[map['Generated At']];
      const printed = row[map['Printed At']];
      const fulfilled = row[map['Fulfilled Date']];
      const notified = row[map['Notification Status']];
      const pickedUp = row[map['Picked-Up']];
      const restocked = row[map['Restocked']];

      const expired = ts && !pickedUp && (now - ts) / (1000 * 60 * 60 * 24) > 10;

      let status = '';
      if (restocked) status = 'Restocked';
      else if (pickedUp) status = 'Picked Up';
      else if (expired) status = 'Expired';
      else if (fulfilled && notified === 'Notified' && !pickedUp) status = 'Awaiting Pick-up';
      else if (fulfilled && !notified) status = 'Filled - Not Notified';
      else if (generated && printed && !fulfilled) status = 'In Progress';
      else if (generated && !printed) status = 'Not Printed';
      else continue; // skip unknown / empty

      if (selectedStatuses.includes('Any') || selectedStatuses.includes(status)) {
        results.push({
          status,
          timestamp: Utilities.formatDate(ts, Session.getScriptTimeZone(), 'M/d/yyyy'),
          formId: formId || '',
          name,
          phone,
          printed: printed || '',
          fulfilled: fulfilled || '',
          notified: notified || '',
          pickedUp: pickedUp || '',
          restocked: restocked || ''
        });
      }
    }

    return { ok: true, rows: results };
  } catch (err) {
    Logger.log('❌ searchOrderMetrics failed: %s', err);
    return { ok: false, message: String(err) };
  }
}