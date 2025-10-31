/** SPCA Pet Pantry — Reprint (Archive Search + Merge)
 * Handles:
 *  • Searching archived PDFs by date or client name
 *  • Merging selected archived forms into a printable PDF
 *  • Returning results to the UI (ui-reprint.html)
 *
 * Depends on:
 *  - PA_CONFIG (in Code.gs)
 *  - _callMergeFlexible_() (in Code.gs)
 *  - Shared helpers (_parseISODateStart_, _parseISODateEndExclusive_)
 */

/* ===== Reprint: Search & Merge ===== */

/**
 * Search archived PDFs by inclusive date range.
 */
function searchArchiveByDateRange(startISO, endISO) {
  try {
    const start = _parseISODateStart_(startISO);
    const endExcl = _parseISODateEndExclusive_(endISO);
    if (!start || !endExcl) throw new Error('Invalid date range.');

    const files = _listArchivePdfs_().filter(f => {
      const meta = _parseFormName_(f.getName());
      return meta && meta.dt >= start && meta.dt < endExcl;
    });

    Logger.log(`📅 searchArchiveByDateRange: ${files.length} file(s) matched.`);
    return { ok: true, files: _toClientFiles_(files) };
  } catch (err) {
    Logger.log('❌ searchArchiveByDateRange error: %s', err);
    return { ok: false, message: String(err), files: [] };
  }
}

/**
 * Search archived PDFs by client name (first or last).
 */
function searchArchiveByClientName(query) {
  try {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { ok: true, files: [] };

    const files = _listArchivePdfs_().filter(f => {
      const meta = _parseFormName_(f.getName());
      return meta && meta.client && meta.client.toLowerCase().includes(q);
    });

    Logger.log(`🧍 searchArchiveByClientName: '${q}' → ${files.length} match(es).`);
    return { ok: true, files: _toClientFiles_(files) };
  } catch (err) {
    Logger.log('❌ searchArchiveByClientName error: %s', err);
    return { ok: false, message: String(err), files: [] };
  }
}

/**
 * Merge selected archived PDFs into one file for printing (no save).
 */
function getMergedPdfFromArchive(fileIds) {
  try {
    if (!Array.isArray(fileIds) || !fileIds.length)
      return { ok: false, message: 'No files selected.' };

    const payloadFiles = [];
    let totalBytes = 0;

    for (let i = 0; i < fileIds.length && i < PA_CONFIG.MAX_FILES; i++) {
      const id = String(fileIds[i]);
      try {
        const f = DriveApp.getFileById(id);
        if (!isPdf_(f)) continue;
        if (!_fileHasParent_(f, PA_CONFIG.ARCHIVE_FOLDER_ID)) continue;

        const bytes = f.getBlob().getBytes();
        totalBytes += bytes.length;
        if (totalBytes > PA_CONFIG.MAX_TOTAL_BYTES) {
          Logger.log('⚠️ Merge size cap reached.');
          break;
        }

        payloadFiles.push({
          name: f.getName(),
          contentBase64: Utilities.base64Encode(bytes)
        });
      } catch (e) {
        Logger.log('⚠️ Skipping file %s: %s', id, e);
      }
    }

    if (!payloadFiles.length)
      return { ok: false, message: 'No eligible archive files.' };

    Logger.log(`🧩 getMergedPdfFromArchive: merging ${payloadFiles.length} file(s).`);
    return _callMergeFlexible_(payloadFiles);
  } catch (err) {
    Logger.log('❌ getMergedPdfFromArchive error: %s', err);
    return { ok: false, message: String(err) };
  }
}

/* ===== Helpers ===== */

/** Returns all PDFs in the Archive folder. */
function _listArchivePdfs_() {
  const folder = DriveApp.getFolderById(PA_CONFIG.ARCHIVE_FOLDER_ID);
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (isPdf_(f)) out.push(f);
  }
  return out;
}

/** Lightweight metadata for UI display. */
function _toClientFiles_(files) {
  const tz = Session.getScriptTimeZone();
  return files.map(f => ({
    id: f.getId(),
    name: f.getName(),
    size: f.getSize(),
    created: Utilities.formatDate(f.getDateCreated(), tz, 'yyyy-MM-dd HH:mm')
  })).sort((a, b) => a.created.localeCompare(b.created));
}

/** Check if file belongs to specific folder. */
function _fileHasParent_(file, folderId) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}

/** Quick type check for PDFs. */
function isPdf_(file) {
  return file && file.getMimeType && file.getMimeType() === MimeType.PDF;
}

/**
 * Parse Pantry form filename:
 * Expected format: PetPantryForm_First_Last_FormID_YYYYMMDD_HHmm.pdf
 */
function _parseFormName_(name) {
  try {
    const base = String(name || '').replace(/\.pdf$/i, '');
    const parts = base.split('_');
    if (parts.length < 4) return null;

    const timeStr = parts.pop();
    const dateStr = parts.pop();
    parts.pop(); // remove FormID
    const client = parts.join('_')
      .replace(/^PetPantryForm_/, '')
      .replace(/_/g, ' ')
      .trim();

    if (!/^\d{8}$/.test(dateStr) || !/^\d{4}$/.test(timeStr)) return null;

    const y = +dateStr.slice(0, 4),
          m = +dateStr.slice(4, 6),
          d = +dateStr.slice(6, 8),
          hh = +timeStr.slice(0, 2),
          mm = +timeStr.slice(2, 4);

    return { client, dt: new Date(y, m - 1, d, hh, mm) };
  } catch (e) {
    Logger.log('_parseFormName_ error: %s', e);
    return null;
  }
}

/* ===== Safe Exports ===== */
(function(){
  const g = (typeof globalThis !== 'undefined' ? globalThis : this);
  g.searchArchiveByDateRange = searchArchiveByDateRange;
  g.searchArchiveByClientName = searchArchiveByClientName;
  g.getMergedPdfFromArchive = getMergedPdfFromArchive;
})();