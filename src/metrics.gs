<div class="card">
  <div class="toolbar" style="justify-content:space-between;align-items:center;flex-wrap:wrap;">
    <button id="backFromMetrics" class="btn ghost">← Back</button>
    <h2 style="margin:0;">Form Metrics</h2>
  </div>

  <p>Search and filter Pantry Orders using the options below.</p>

  <div class="field-group" style="display:grid;gap:16px;margin-top:10px;">
    <!-- Quick Date Buttons -->
    <div class="field">
      <label><strong>Date:</strong></label><br>
      <div id="quickDates" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
        <button class="quick-btn" data-range="today">Today</button>
        <button class="quick-btn" data-range="yesterday">Yesterday</button>
        <button class="quick-btn" data-range="7">Last 7 Days</button>
        <button class="quick-btn" data-range="30">Last 30 Days</button>
        <button class="quick-btn" data-range="custom">Custom</button>
      </div>
    </div>

    <!-- Custom date range -->
    <div id="customRange" style="display:none;gap:10px;align-items:center;">
      <input type="date" id="startDate" class="input-lg" />
      <span>–</span>
      <input type="date" id="endDate" class="input-lg" />
    </div>

    <!-- Status Dropdown -->
    <div class="field">
      <label><strong>Status:</strong></label><br>
      <div class="dropdown">
        <button id="statusDropdown" class="btn secondary" type="button">Select Status ▾</button>
        <div id="statusMenu" class="dropdown-menu">
          <label><input type="checkbox" value="Any" checked> Any</label>
          <label><input type="checkbox" value="Not Printed"> Not Printed</label>
          <label><input type="checkbox" value="In Progress"> In Progress</label>
          <label><input type="checkbox" value="Filled - Not Notified"> Filled - Not Notified</label>
          <label><input type="checkbox" value="Awaiting Pick-up"> Awaiting Pick-up</label>
          <label><input type="checkbox" value="Picked Up"> Picked Up</label>
          <label><input type="checkbox" value="Expired"> Expired</label>
          <label><input type="checkbox" value="Restocked"> Restocked</label>
        </div>
      </div>
    </div>

    <div class="actions" style="margin-top:10px;">
      <button id="btnSearch" class="btn">Search</button>
      <button id="btnClear" class="btn secondary">Clear</button>
    </div>
  </div>

  <div id="msg" class="msg" style="display:none;margin-top:12px;"></div>
  <div id="resultsContainer" style="display:none;margin-top:20px;"></div>
</div>

<style>
  .input-lg {
    padding:10px 12px;
    border-radius:10px;
    border:1px solid #cbd5e1;
    font-size:16px;
    flex:1;
    min-width:160px;
  }
  .quick-btn {
    background:#e2e8f0;
    color:#0f172a;
    border:none;
    border-radius:8px;
    padding:8px 14px;
    cursor:pointer;
    font-weight:600;
    transition:all .15s ease;
  }
  .quick-btn:hover { background:var(--accent); color:#fff; }
  .quick-btn.active { background:var(--accent); color:#fff; box-shadow:0 0 0 2px #0ea5e966 inset; }

  .dropdown { position:relative; display:inline-block; }
  .dropdown-menu {
    display:none;
    position:absolute;
    background:#fff;
    border:1px solid #cbd5e1;
    border-radius:10px;
    padding:10px;
    box-shadow:0 4px 14px rgba(0,0,0,0.1);
    z-index:10;
  }
  .dropdown-menu label {
    display:block;
    padding:4px 6px;
    font-size:16px;
    cursor:pointer;
  }
  .dropdown-menu input { margin-right:6px; }
  .dropdown.show .dropdown-menu { display:block; }

  .spinner {
    width:22px;height:22px;
    border-radius:50%;
    border:3px solid #e2e8f0;
    border-top-color:var(--accent,#0ea5e9);
    animation:spin 1s linear infinite;
    display:inline-block;
    vertical-align:middle;
    margin-right:8px;
  }
  @keyframes spin {to{transform:rotate(360deg)}}

  .print-btn {
    margin-top:16px;
    padding:10px 16px;
    background:var(--accent);
    color:#fff;
    border:none;
    border-radius:10px;
    cursor:pointer;
    font-weight:600;
  }
  .print-btn:hover { background:var(--accent-hover); }
</style>

<script>
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const quickBtns = $$('#quickDates .quick-btn');
  const customRange = $('#customRange');
  const dropdown = $('.dropdown');
  const dropdownBtn = $('#statusDropdown');
  const msg = $('#msg');
  const results = $('#resultsContainer');
  let lastRows = [];

  /* ===== Quick date logic ===== */
  quickBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      quickBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.range;
      customRange.style.display = (val==='custom') ? 'flex' : 'none';
    });
  });

  /* ===== Dropdown logic ===== */
  dropdownBtn.addEventListener('click',()=> dropdown.classList.toggle('show'));
  document.addEventListener('click',e=>{
    if(!dropdown.contains(e.target)) dropdown.classList.remove('show');
  });

  function getSelectedStatuses(){
    return $$('#statusMenu input:checked').map(cb=>cb.value);
  }

  /* ===== Search ===== */
  $('#btnSearch').addEventListener('click',()=>{
    const range = $('.quick-btn.active')?.dataset.range || '';
    const statuses = getSelectedStatuses();
    if(!range){ setMsg('Please choose a date range first.','error'); return; }

    setBusy(true, `Searching for ${statuses.join(', ')} in range ${range}…`);

    const q = {
      range,
      statuses,
      start: $('#startDate').value || '',
      end: $('#endDate').value || ''
    };

    google.script.run
      .withSuccessHandler(res => {
        setBusy(false);
        if (!res || !res.ok) { setMsg(res?.message || 'Search failed.','error'); return; }
        const rows = Array.isArray(res.rows) ? res.rows : [];
        if (!rows.length) { setMsg('No results found.','error'); results.style.display='none'; return; }
        lastRows = rows;
        renderResults(rows);
      })
      .withFailureHandler(err => {
        setBusy(false);
        setMsg('Search failed: ' + err.message,'error');
      })
      .searchOrderMetrics(q);
  });

  /* ===== Render Results ===== */
  function renderResults(rows){
    const html = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#eaf2f8;">
            <th>Status</th><th>Date of Request</th><th>Form ID</th>
            <th>Client Name</th><th>Phone</th>
            <th>Printed</th><th>Fulfilled</th><th>Notified</th>
            <th>Picked Up</th><th>Restocked</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i)=>`
            <tr style="background:${i%2?'#f8fafc':'#fff'};">
              <td>${r.status||''}</td>
              <td>${r.requestDate||''}</td>
              <td>${r.formId||''}</td>
              <td>${r.clientName||''}</td>
              <td>${r.phone||''}</td>
              <td>${r.printed||''}</td>
              <td>${r.fulfilled||''}</td>
              <td>${r.notified||''}</td>
              <td>${r.pickedUp||''}</td>
              <td>${r.restocked||''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <button id="btnPrintResults" class="print-btn">🖨️ Print Results</button>
    `;
    results.innerHTML = html;
    results.style.display='block';
    setMsg(`${rows.length} result${rows.length>1?'s':''} found.`,'success');
    $('#btnPrintResults').addEventListener('click',()=>printResults(rows));
  }

  /* ===== Print ===== */
  function printResults(rows){
    const printable = `
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <title>Form Metrics Report</title>
        <style>
          body{font-family:system-ui,sans-serif;padding:24px;}
          h2{margin-top:0;text-align:center;}
          table{width:100%;border-collapse:collapse;}
          th,td{border:1px solid #ccc;padding:6px 8px;font-size:14px;}
          th{background:#f0f4f8;}
          tr:nth-child(even){background:#fafafa;}
        </style>
      </head>
      <body>
        <h2>SPCA Pet Pantry — Form Metrics Report</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th><th>Date of Request</th><th>Form ID</th>
              <th>Client Name</th><th>Phone</th>
              <th>Printed</th><th>Fulfilled</th><th>Notified</th>
              <th>Picked Up</th><th>Restocked</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${r.status||''}</td>
                <td>${r.requestDate||''}</td>
                <td>${r.formId||''}</td>
                <td>${r.clientName||''}</td>
                <td>${r.phone||''}</td>
                <td>${r.printed||''}</td>
                <td>${r.fulfilled||''}</td>
                <td>${r.notified||''}</td>
                <td>${r.pickedUp||''}</td>
                <td>${r.restocked||''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <script>window.onload=()=>window.print();<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(printable);
    w.document.close();
  }

  /* ===== Clear ===== */
  $('#btnClear').addEventListener('click',()=>{
    quickBtns.forEach(b=>b.classList.remove('active'));
    $$('#statusMenu input').forEach(cb=>cb.checked=false);
    $('#startDate').value=''; $('#endDate').value='';
    customRange.style.display='none';
    results.style.display='none';
    setMsg('','');
  });

  $('#backFromMetrics').addEventListener('click',()=> showScreen('home'));

  /* ===== Helpers ===== */
  function setBusy(busy,text){
    if(busy){ setMsg(`<span class="spinner"></span>${text||'Working…'}`,'info'); }
    else { msg.innerHTML=''; msg.style.display='none'; }
  }
  function setMsg(html,type){
    msg.innerHTML=html||''; msg.className='msg '+(type||'');
    msg.style.display=html?'block':'none';
  }
})();
</script>