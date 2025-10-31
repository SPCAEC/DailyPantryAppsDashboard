/** SPCA Pet Pantry — Grab & Merge (with Printed At tracking)
 * Lists new PDFs, merges via Render, archives originals, and marks rows as printed.
 */

const GNG = {
  COMPLETED_FOLDER_ID: '1ccWalGXHxLJVN-G92GTzv8OIF_rHq7QO',
  ARCHIVE_FOLDER_ID:   '1IWY9IQVQvZa42vq6XluLMDkG7Bv-Sajp',
  MERGE_SERVICE_URL:   'https://pdf-merge-service.onrender.com',
  SOURCE_SHEET_ID:     '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU',
  SHEET_NAME:          'Form Responses 1',
  MAX_FILES: 250,
  MAX_TOTAL_BYTES: 45 * 1024 * 1024, // ~45 MB
  PRINTED_AT_COL: 'Printed At'
};

/* ===== Public: List PDFs waiting to be merged ===== */
function listNewForms() {
  const tz = Session.getScriptTimeZone();
  const completed = DriveApp.getFolderById(GNG.COMPLETED_FOLDER_ID);
  const out = [];

  const it = completed.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() !== MimeType.PDF) continue;

    // Must be inside Completed and NOT already inside Archive
    let inCompleted = false, inArchive = false;
    const parents = f.getParents();
    while (parents.hasNext()) {
      const p = parents.next();
      if (p.getId() === GNG.COMPLETED_FOLDER_ID) inCompleted = true;
      if (p.getId() === GNG.ARCHIVE_FOLDER_ID)   inArchive   = true;
    }
    if (!inCompleted || inArchive) continue;

    out.push({
      id: f.getId(),
      name: f.getName(),
      size: f.getSize(),
      created: Utilities.formatDate(f.getDateCreated(), tz, 'yyyy-MM-dd HH:mm')
    });
  }

  out.sort((a, b) => a.created.localeCompare(b.created));
  return { ok: true, files: out, count: out.length };
}

/* ===== Public: Merge selected PDFs and archive originals ===== */
function getMergedPdfAndArchive(fileIds) {
  if (!Array.isArray(fileIds) || !fileIds.length)
    return { ok: false, message: 'No files selected.' };

  const completed = DriveApp.getFolderById(GNG.COMPLETED_FOLDER_ID);
  const archive   = DriveApp.getFolderById(GNG.ARCHIVE_FOLDER_ID);
  const ss        = SpreadsheetApp.openById(GNG.SOURCE_SHEET_ID);
  const sh        = ss.getSheetByName(GNG.SHEET_NAME);
  const headers   = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const formIdCol = headers.indexOf('FormID') + 1;
  const printedCol = headers.indexOf(GNG.PRINTED_AT_COL) + 1;

  if (!formIdCol || !printedCol)
    throw new Error('Missing FormID or Printed At column in sheet.');

  const payloadFiles = [];
  const eligibleIds  = [];
  const formIdsMoved = [];
  let totalBytes = 0;

  // --- Stage files for merge
  for (let i = 0; i < fileIds.length && i < GNG.MAX_FILES; i++) {
    const id = String(fileIds[i]);
    try {
      const f = DriveApp.getFileById(id);
      if (f.getMimeType() !== MimeType.PDF) continue;

      let inCompleted = false, inArchive = false;
      const parents = f.getParents();
      while (parents.hasNext()) {
        const p = parents.next();
        if (p.getId() === GNG.COMPLETED_FOLDER_ID) inCompleted = true;
        if (p.getId() === GNG.ARCHIVE_FOLDER_ID)   inArchive   = true;
      }
      if (!inCompleted || inArchive) continue;

      const bytes = f.getBlob().getBytes();
      totalBytes += bytes.length;
      if (totalBytes > GNG.MAX_TOTAL_BYTES) break;

      payloadFiles.push({
        name: f.getName(),
        contentBase64: Utilities.base64Encode(bytes)
      });
      eligibleIds.push(id);
    } catch (e) {
      Logger.log('Skipping file (read error): %s — %s', id, e);
    }
  }

  if (!payloadFiles.length)
    return { ok: false, message: 'No eligible files under size cap.' };

  const result = _gng_callMergeFlexible_(payloadFiles);
  if (!result.ok) return result;

  // --- Archive originals + mark "Printed At"
  const archivedIds = [];
  const printedMap = {};

  eligibleIds.forEach(id => {
    try {
      const f = DriveApp.getFileById(id);
      archive.addFile(f);
      completed.removeFile(f);
      archivedIds.push(id);

      // Extract FormID from file name (e.g. PetPantryForm_First_Last_100000000254_20251030_1819.pdf)
      const name = f.getName();
      const match = name.match(/_(\d{12})_/);
      if (match) {
        const formId = match[1];
        printedMap[formId] = new Date();
      } else {
        Logger.log('⚠️ No FormID found in file name: %s', name);
      }

    } catch (e) {
      Logger.log('Archive move failed %s → %s', id, e);
    }
  });

  // --- Apply Printed At updates in sheet
  if (Object.keys(printedMap).length) {
    const allValues = sh.getRange(2, formIdCol, sh.getLastRow() - 1).getValues();
    const now = new Date();
    const updates = [];

    allValues.forEach((row, i) => {
      const idVal = String(row[0]).trim();
      if (printedMap[idVal]) {
        updates.push([now]);
      } else {
        updates.push([sh.getRange(i + 2, printedCol).getValue() || null]);
      }
    });

    sh.getRange(2, printedCol, updates.length, 1).setValues(updates);
    Logger.log('✅ Updated Printed At for %s form(s)', Object.keys(printedMap).length);
  }

  return {
    ok: true,
    base64: result.base64,
    archivedIds,
    countMerged: payloadFiles.length
  };
}

/* ===== Internal: Flexible merge caller (JSON or PDF) ===== */
function _gng_callMergeFlexible_(payloadFiles) {
  const base = String(GNG.MERGE_SERVICE_URL || '').replace(/\/+$/, '');
  const url  = base + '/merge';

  const body = JSON.stringify({
    outputName: 'Merged_' + Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'
    ) + '.pdf',
    files: payloadFiles
  });

  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json, application/pdf' }
    });
  } catch (e) {
    return { ok: false, message: 'Merge service unreachable: ' + e };
  }

  const code = res.getResponseCode();
  const ct   = (res.getHeaders()['Content-Type'] || '').toLowerCase();
  Logger.log('Merge response %s %s', code, ct);

  if (code < 200 || code >= 300)
    return { ok: false, message: `Merge error ${code}: ${_gng_safeText(res).slice(0, 200)}` };

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

function _gng_safeText(res) {
  try { return res.getContentText(); } catch (_) { return '<non-text response>'; }
}

/* ===== Exports ===== */
(function () {
  const g = (typeof globalThis !== 'undefined' ? globalThis : this);
  g.listNewForms = listNewForms;
  g.getMergedPdfAndArchive = getMergedPdfAndArchive;
})();