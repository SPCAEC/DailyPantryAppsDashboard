/**
 * SPCA Pet Pantry — Form Recreate (via Generator Web API)
 *
 * Sends recreate requests (by FormID) to the Form Generator web app.
 * Uses secure shared key auth (SERVICE_API_KEY).
 *
 * Does NOT alter original "Generated PDF" metadata —
 * only updates the "Regenerated PDF ID / URL / Last Regenerated At" columns
 * in the generator’s sheet when completed.
 */

const RECREATE_API = {
  URL: 'https://script.google.com/macros/s/AKfycby-absqTynjSroU3sOQVv08uxbav2Qeuaq2xN5S52iERtnNXJ1OV89GLc_2TJcVUPd4/exec',
  KEY: 'pantry_recreate_secret' // must match SERVICE_API_KEY in Form Generator
};

/**
 * Main entry point — triggers form regeneration by one or more FormIDs.
 * @param {string|string[]} formIds - One or more FormIDs to recreate
 * @returns {object} - { ok:boolean, results?:Array, message?:string }
 */
function recreateFormsById(formIds) {
  const ids = Array.isArray(formIds) ? formIds.map(String) : [String(formIds)];
  if (!ids.length) return { ok: false, message: 'No FormIDs provided.' };

  try {
    const payload = {
      action: 'recreate',
      serviceKey: RECREATE_API.KEY,
      formIds: ids
    };

    const res = UrlFetchApp.fetch(RECREATE_API.URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText() || '';
    Logger.log(`🔗 recreateFormsById response code=${code}`);
    Logger.log(`🔗 recreateFormsById raw response:\n${text}`);

    if (code !== 200) {
      return {
        ok: false,
        message: `Generator returned HTTP ${code}.`,
        raw: text.slice(0, 500)
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: 'Invalid JSON response from generator.', raw: text.slice(0, 300) };
    }

    if (!json.ok) {
      return { ok: false, message: json.message || 'Generator reported failure.', results: json.results || [] };
    }

    Logger.log(`✅ recreateFormsById success: ${JSON.stringify(json)}`);
    return { ok: true, results: json.results || [] };

  } catch (err) {
    Logger.log(`❌ recreateFormsById error: ${err.stack || err}`);
    return { ok: false, message: `Unexpected error: ${String(err)}` };
  }
}

/**
 * Lightweight test ping to confirm connectivity to generator endpoint.
 * Returns API health status.
 */
function testGeneratorConnection() {
  try {
    const res = UrlFetchApp.fetch(RECREATE_API.URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ action: 'ping', serviceKey: RECREATE_API.KEY }),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText() || '';
    Logger.log(`🔗 testGeneratorConnection response code=${code}`);
    Logger.log(`🔗 testGeneratorConnection raw response:\n${text}`);

    if (code !== 200) return { ok: false, message: `Ping failed (HTTP ${code})` };

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: 'Invalid JSON in ping response.' };
    }

    return json;
  } catch (err) {
    Logger.log(`❌ testGeneratorConnection failed: ${err.stack || err}`);
    return { ok: false, message: `Unexpected error: ${String(err)}` };
  }
}