/**
 * Search helper for “Recreate Forms” screen.
 * Filters only rows that have a “Generated At” value.
 * Supports search by date range, name, or FormID.
 * q = { start, end, first, last, formId }
 */
/**
 * Search form responses for recreate screen.
 * Filters by date range, name, or FormID.
 */
/**
 * Search form responses for recreate screen.
 * Filters by date range, name, or FormID.
 */
function searchFormsForRecreate(q) {
  try {
    // --- Local config (self-contained) ---
    const SOURCE_SHEET_ID = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU';
    const RESPONSE_SHEET_NAME = 'Form Responses 1';
    const TZ = Session.getScriptTimeZone();

    const ss = SpreadsheetApp.openById(SOURCE_SHEET_ID);
    const sh = ss.getSheetByName(RESPONSE_SHEET_NAME);
    const data = sh.getDataRange().getValues();
    const headers = data.shift();
    const map = Object.fromEntries(headers.map((h, i) => [h.trim(), i]));

    const colTs  = map['Timestamp'];
    const colFn  = map['First Name'];
    const colLn  = map['Last Name'];
    const colGen = map['Generated At'];
    const colId  = map['FormID'];

    const startDate = q.start ? new Date(`${q.start}T00:00:00`) : null;
    const endDate   = q.end   ? new Date(`${q.end}T23:59:59`) : null;
    const first = (q.first || '').toLowerCase();
    const last  = (q.last || '').toLowerCase();
    const formId = (q.formId || '').trim();

    const results = [];

    for (const row of data) {
      const tsRaw = row[colTs];
      if (!(tsRaw instanceof Date)) continue;

      // --- Date range filter ---
      if (startDate && tsRaw < startDate) continue;
      if (endDate && tsRaw > endDate) continue;

      // --- Name filter ---
      const fn = String(row[colFn] || '').toLowerCase();
      const ln = String(row[colLn] || '').toLowerCase();
      if (first && !fn.includes(first)) continue;
      if (last && !ln.includes(last)) continue;

      // --- FormID filter ---
      const fid = String(row[colId] || '');
      if (formId && fid !== formId) continue;

      // --- Must have generated form ---
      const genAt = row[colGen];
      if (!genAt) continue;

      results.push({
        timestamp: Utilities.formatDate(tsRaw, TZ, 'M/d/yyyy'),
        name: `${fn ? fn.charAt(0).toUpperCase() + fn.slice(1) : ''} ${ln ? ln.charAt(0).toUpperCase() + ln.slice(1) : ''}`.trim(),
        generatedAt: genAt instanceof Date ? Utilities.formatDate(genAt, TZ, 'M/d/yyyy') : genAt,
        formId: fid
      });
    }

    // Sort newest → oldest
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { ok: true, rows: results };
  } catch (err) {
    Logger.log('❌ searchFormsForRecreate failed: %s', err);
    return { ok: false, message: String(err) };
  }
}
