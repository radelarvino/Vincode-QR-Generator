/* ============================================================
   app.js — orkestrasi UI aplikasi MODUL
   ============================================================ */

(() => {
  let currentType = 'url';
  let formData = {};
  let logoImg = null;
  let currentPayload = '';
  let debounceTimer = null;
  let dbReady = false; // true setelah penyimpanan riwayat berhasil siap dipakai

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------------------- TOAST ---------------------- */
  function toast(msg){
    const el = $('#toast');
    el.innerHTML = `<span class="toast-dot"></span>${msg}`;
    el.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 2400);
  }

  /* ---------------------- NAVIGATION ---------------------- */
  function switchView(view){
    $$('.view').forEach(v => v.classList.remove('is-active'));
    $$('.nav-btn').forEach(b => b.classList.remove('is-active'));
    $(`#view-${view}`).classList.add('is-active');
    const navBtn = $$('.nav-btn').find(b => b.dataset.view === view);
    if (navBtn) navBtn.classList.add('is-active');
    if (view === 'history'){
      renderHistory();
    } else if (typeof isSelectMode !== 'undefined' && isSelectMode){
      // keluar dari mode pilih kalau pindah ke tab lain, biar state nggak nyangkut
      exitSelectMode();
    }
  }

  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $$('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });

  /* Klik logo/nama brand di kiri atas -> kembali ke halaman Buat QR */
  const brandHomeBtn = $('#brandHome');
  if (brandHomeBtn){
    brandHomeBtn.addEventListener('click', () => switchView('generator'));
  }

  /* ---------------------- DARK MODE ---------------------- */
  const THEME_KEY = 'modul-qr-theme';
  const themeToggleBtn = $('#themeToggle');

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light'){
      applyTheme(saved);
    } else {
      // belum ada preferensi tersimpan -> ikuti pengaturan sistem perangkat
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }

  if (themeToggleBtn){
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      toast(next === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif');
    });
  }

  initTheme();

  /* ---------------------- DYNAMIC FORM BUILDER ---------------------- */
  function buildForm(type){
    const stack = $('#fieldStack');
    stack.innerHTML = '';
    formData = {};
    const schema = QRField.schema[type];

    schema.forEach(f => {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      if (f.type === 'textarea'){
        wrap.innerHTML = `<label>${f.label}</label><textarea data-key="${f.key}" placeholder="${f.placeholder||''}"></textarea>`;
      } else if (f.type === 'radio'){
        wrap.innerHTML = `<label>${f.label}</label>`;
        const row = document.createElement('div');
        row.className = 'radio-row';
        f.options.forEach(opt => {
          const chip = document.createElement('label');
          chip.className = 'radio-chip' + (opt.value === f.default ? ' is-checked' : '');
          chip.innerHTML = `<input type="radio" name="${f.key}" value="${opt.value}" ${opt.value===f.default?'checked':''}><span>${opt.label}</span>`;
          row.appendChild(chip);
        });
        wrap.appendChild(row);
        formData[f.key] = f.default;
      } else if (f.type === 'checkbox'){
        wrap.innerHTML = `<label class="radio-chip" style="display:inline-flex;width:auto;position:relative;padding:9px 14px;">
          <input type="checkbox" data-key="${f.key}" style="position:static;opacity:1;width:auto;margin-right:6px;">
          <span>${f.label}</span>
        </label>`;
      } else {
        wrap.innerHTML = `<label>${f.label}</label><input type="${f.type}" data-key="${f.key}" placeholder="${f.placeholder||''}">`;
      }
      stack.appendChild(wrap);
    });

    // wire up events
    stack.querySelectorAll('[data-key]').forEach(el => {
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const key = el.dataset.key;
        formData[key] = el.type === 'checkbox' ? el.checked : el.value;
        scheduleUpdate();
      });
    });
    stack.querySelectorAll('input[type="radio"]').forEach(el => {
      el.addEventListener('change', () => {
        formData[el.name] = el.value;
        stack.querySelectorAll(`input[name="${el.name}"]`).forEach(r => {
          r.closest('.radio-chip').classList.toggle('is-checked', r.checked);
        });
        scheduleUpdate();
      });
    });

    scheduleUpdate();
  }

  $$('.type-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.type-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentType = chip.dataset.type;
      buildForm(currentType);
    });
  });

  /* ---------------------- STYLE CONTROLS ---------------------- */
  const fgColor = $('#fgColor'), fgHex = $('#fgColorHex');
  const bgColor = $('#bgColor'), bgHex = $('#bgColorHex');
  const errLevel = $('#errLevel');
  const dotStyle = $('#dotStyle');
  let activeTemplateId = null; // template terakhir yang dipilih, null = kustom

  function syncColor(colorEl, hexEl){
    colorEl.addEventListener('input', () => { hexEl.value = colorEl.value.toUpperCase(); markCustom(); scheduleUpdate(); });
    hexEl.addEventListener('input', () => {
      let v = hexEl.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(v)){
        if (!v.startsWith('#')) v = '#' + v;
        colorEl.value = v;
        markCustom();
        scheduleUpdate();
      }
    });
  }
  syncColor(fgColor, fgHex);
  syncColor(bgColor, bgHex);
  errLevel.addEventListener('change', () => { markCustom(); scheduleUpdate(); });
  dotStyle.addEventListener('change', () => { markCustom(); scheduleUpdate(); });

  /* Kalau pengguna ubah warna/style manual setelah pilih template,
     lepas status "aktif" dari kartu template supaya tidak menyesatkan */
  function markCustom(){
    if (activeTemplateId === null) return;
    activeTemplateId = null;
    $$('.template-card').forEach(c => c.classList.remove('is-active'));
  }

  /* ---------------------- TEMPLATE GALLERY ---------------------- */
  function renderTemplateGallery(){
    const gallery = $('#templateGallery');
    gallery.innerHTML = '';

    QRTemplates.forEach(t => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      card.dataset.templateId = t.id;
      card.setAttribute('title', `${t.name} — ${t.group}`);

      // pola swatch mini 5x5 acak-tetap berdasar id, biar tiap kartu punya "wajah" beda
      const seedNum = [...t.id].reduce((a, c) => a + c.charCodeAt(0), 0);
      let dots = '';
      for (let i = 0; i < 25; i++){
        const on = ((seedNum + i * 7) % 3 !== 0);
        const radius = t.dotStyle === 'dots' ? '50%' : t.dotStyle === 'rounded' ? '30%' : '1px';
        dots += `<span style="background:${on ? t.fg : 'transparent'}; border-radius:${radius};"></span>`;
      }

      card.innerHTML = `
        <div class="template-swatch" style="background:${t.bg};">
          <div class="template-swatch-pattern">${dots}</div>
        </div>
        <div class="template-name">${t.name}</div>
      `;

      card.addEventListener('click', () => applyTemplate(t));
      gallery.appendChild(card);
    });
  }

  function applyTemplate(t){
    fgColor.value = t.fg; fgHex.value = t.fg.toUpperCase();
    bgColor.value = t.bg; bgHex.value = t.bg.toUpperCase();
    dotStyle.value = t.dotStyle;
    errLevel.value = t.errorLevel;
    activeTemplateId = t.id;
    $$('.template-card').forEach(c => c.classList.toggle('is-active', c.dataset.templateId === t.id));
    scheduleUpdate();
    toast(`Template "${t.name}" dipakai ✓`);
  }

  renderTemplateGallery();

  /* ---------------------- LOGO UPLOAD ---------------------- */
  const logoInput = $('#logoUpload');
  $('#logoUploadBtn').addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        logoImg = img;
        $('#logoFilename').textContent = file.name;
        $('#logoClearBtn').hidden = false;
        scheduleUpdate();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  $('#logoClearBtn').addEventListener('click', () => {
    logoImg = null;
    logoInput.value = '';
    $('#logoFilename').textContent = 'Tidak ada berkas dipilih';
    $('#logoClearBtn').hidden = true;
    scheduleUpdate();
  });

  /* ---------------------- LIVE PREVIEW ---------------------- */
  function scheduleUpdate(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, 180);
  }

  function updatePreview(){
    const payload = QRField.buildPayload(currentType, formData);
    currentPayload = payload;
    const canvas = $('#qrCanvas');
    const empty = $('#previewEmpty');
    const meta = $('#previewMeta');
    const saveBtn = $('#saveHistoryBtn');

    if (!payload || !payload.trim() || payload === 'https://' || payload === 'tel:' || payload === 'mailto:'){
      canvas.classList.remove('is-visible');
      empty.style.display = 'flex';
      meta.textContent = '—';
      saveBtn.disabled = true;
      return;
    }

    try {
      QRRenderer.render(canvas, payload, errLevel.value, {
        fg: fgHex.value,
        bg: bgHex.value,
        dotStyle: dotStyle.value,
        size: 480,
        logoImg
      });
      canvas.classList.add('is-visible');
      empty.style.display = 'none';
      const summary = QRField.summarize(currentType, formData);
      meta.textContent = summary.length > 60 ? summary.slice(0, 60) + '…' : summary;
      saveBtn.disabled = false;
    } catch (e){
      canvas.classList.remove('is-visible');
      empty.style.display = 'flex';
      let msg = 'Waduh, ada yang salah pas bikin kode QR-nya.';
      if (e.message === 'LIBRARY_NOT_LOADED'){
        msg = 'Pustaka pembuat QR-nya gagal dimuat. Coba cek koneksi internet, lalu muat ulang halaman ya.';
      } else if (e.message === 'DATA_TOO_LONG'){
        msg = 'Datanya kepanjangan buat level ketahanan ini. Coba turunkan ke "Rendah" atau persingkat isinya.';
      }
      empty.querySelector('p').textContent = msg;
      meta.textContent = '—';
      saveBtn.disabled = true;
      console.error('QR render error:', e);
    }
  }

  /* ---------------------- EXPORT ---------------------- */
  $('#downloadPngBtn').addEventListener('click', () => {
    if (!currentPayload) return;
    const size = parseInt($('#exportSize').value, 10);
    const tmp = document.createElement('canvas');
    QRRenderer.render(tmp, currentPayload, errLevel.value, {
      fg: fgHex.value, bg: bgHex.value, dotStyle: dotStyle.value, size, logoImg
    });
    const link = document.createElement('a');
    link.download = `qr-${currentType}-${Date.now()}.png`;
    link.href = tmp.toDataURL('image/png');
    link.click();
    toast('PNG-nya udah diunduh ✓');
  });

  $('#downloadSvgBtn').addEventListener('click', () => {
    if (!currentPayload) return;
    const svg = QRRenderer.toSVG(currentPayload, errLevel.value, {
      fg: fgHex.value, bg: bgHex.value, dotStyle: dotStyle.value
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `qr-${currentType}-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    toast('SVG-nya udah diunduh ✓');
  });

  $('#copyImgBtn').addEventListener('click', async () => {
    if (!currentPayload) return;
    try {
      const canvas = $('#qrCanvas');
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Gambar disalin, tinggal paste aja');
    } catch (e){
      toast('Gagal menyalin — coba unduh sebagai gantinya');
    }
  });

  /* ---------------------- SAVE TO HISTORY (SQLite) ---------------------- */
  $('#saveHistoryBtn').addEventListener('click', async () => {
    if (!currentPayload) return;
    const saveBtn = $('#saveHistoryBtn');

    if (!dbReady){
      toast('Penyimpanan belum siap — coba muat ulang halaman (Ctrl+Shift+R) lalu tunggu sebentar');
      return;
    }

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';

    try {
      const thumbCanvas = document.createElement('canvas');
      QRRenderer.render(thumbCanvas, currentPayload, errLevel.value, {
        fg: fgHex.value, bg: bgHex.value, dotStyle: dotStyle.value, size: 160, logoImg
      });
      const thumbnail = thumbCanvas.toDataURL('image/png');
      const label = $('#qrLabel').value.trim() || QRField.summarize(currentType, formData);

      await QRDatabase.insertRecord({
        label,
        type: currentType,
        payload: currentPayload,
        formData,
        fgColor: fgHex.value,
        bgColor: bgHex.value,
        dotStyle: dotStyle.value,
        errorLevel: errLevel.value,
        thumbnail
      });

      updateHistoryCount();
      toast('Tersimpan ke riwayat ✓');
      $('#qrLabel').value = '';
    } catch (e){
      console.error('Gagal menyimpan ke riwayat:', e);
      toast('Gagal simpan — penyimpanan riwayat belum siap. Coba muat ulang halaman.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

  /* ---------------------- HISTORY VIEW ---------------------- */
  const TYPE_LABELS = { url: 'Tautan', text: 'Teks', wifi: 'WiFi', vcard: 'Kontak', email: 'Email', phone: 'Telepon' };

  function updateHistoryCount(){
    const rows = QRDatabase.getAll();
    $('#historyCount').textContent = rows.length;
  }

  function renderHistory(){
    const grid = $('#historyGrid');
    const empty = $('#historyEmpty');
    const searchTerm = $('#historySearch').value.trim().toLowerCase();
    const filterType = $('#historyFilterType').value;

    let rows = QRDatabase.getAll();
    if (filterType !== 'all') rows = rows.filter(r => r.type === filterType);
    if (searchTerm){
      rows = rows.filter(r =>
        (r.label || '').toLowerCase().includes(searchTerm) ||
        (r.payload || '').toLowerCase().includes(searchTerm)
      );
    }

    // buang id yang sudah tidak ada di daftar saat ini (mis. terhapus/tersaring)
    selectedIds = new Set([...selectedIds].filter(id => rows.some(r => r.id === id)));

    grid.innerHTML = '';
    empty.hidden = rows.length > 0;
    grid.hidden = rows.length === 0;
    currentVisibleIds = rows.map(r => r.id); // dipakai fitur "pilih semua"

    rows.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = 'history-card' + (isSelectMode ? ' is-select-mode' : '');
      if (selectedIds.has(r.id)) card.classList.add('is-selected');
      card.style.animationDelay = `${Math.min(idx, 10) * 35}ms`;
      const date = new Date(r.created_at);
      const dateStr = date.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
      card.innerHTML = `
        <label class="history-card-select" data-role="select-overlay">
          <input type="checkbox" data-role="select-checkbox" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}>
        </label>
        <div class="history-card-top">
          <div class="history-card-thumb"><img src="${r.thumbnail}" alt=""></div>
          <div class="history-card-meta">
            <div class="history-card-label">${escapeHtml(r.label || '(tanpa nama)')}</div>
            <div class="history-card-type">${TYPE_LABELS[r.type] || r.type}</div>
          </div>
        </div>
        <div class="history-card-data">${escapeHtml(r.payload)}</div>
        <div class="history-card-footer">
          <span>${dateStr}</span>
          <div class="history-card-actions">
            <button class="icon-btn" data-action="delete" data-id="${r.id}" title="Hapus">
              <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete"]')) return;
        if (isSelectMode){
          toggleSelect(r.id);
          return;
        }
        openDetailModal(r);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await QRDatabase.deleteRecord(r.id);
        renderHistory();
        updateHistoryCount();
        toast('Dihapus dari riwayat');
      });
      const checkbox = card.querySelector('[data-role="select-checkbox"]');
      const selectOverlay = card.querySelector('[data-role="select-overlay"]');
      selectOverlay.addEventListener('click', (e) => e.stopPropagation());
      checkbox.addEventListener('change', () => toggleSelect(r.id));
      grid.appendChild(card);
    });

    updateSelectionBar();
  }

  /* ---------------------- MODE PILIH & HAPUS MASSAL ---------------------- */
  let isSelectMode = false;
  let selectedIds = new Set();
  let currentVisibleIds = []; // id kartu yang sedang tampil (sesuai filter/pencarian aktif)

  const selectModeBtn = $('#selectModeBtn');
  const selectAllBtn = $('#selectAllBtn');
  const selectionBar = $('#selectionBar');
  const selectAllCheckbox = $('#selectAllCheckbox');
  const deleteSelectedBtn = $('#deleteSelectedBtn');
  const cancelSelectBtn = $('#cancelSelectBtn');

  function enterSelectMode(){
    isSelectMode = true;
    selectedIds = new Set();
    selectModeBtn.hidden = true;
    selectAllBtn.hidden = false;
    cancelSelectBtn.hidden = false;
    selectionBar.hidden = true; // baru muncul begitu ada item yang dicentang
    renderHistory();
  }

  function exitSelectMode(){
    isSelectMode = false;
    selectedIds = new Set();
    selectModeBtn.hidden = false;
    selectAllBtn.hidden = true;
    cancelSelectBtn.hidden = true;
    selectionBar.hidden = true;
    renderHistory();
  }

  function toggleSelect(id){
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    renderHistory();
  }

  /* Pilih/lepas semua kartu yang sedang tampil (menghormati filter/pencarian aktif) */
  function selectAllVisible(){
    const allAlreadySelected = currentVisibleIds.length > 0 && currentVisibleIds.every(id => selectedIds.has(id));
    if (allAlreadySelected){
      currentVisibleIds.forEach(id => selectedIds.delete(id)); // sudah semua -> lepas semua
    } else {
      currentVisibleIds.forEach(id => selectedIds.add(id));
    }
    renderHistory();
  }

  function updateSelectionBar(){
    if (!isSelectMode) return;
    const count = selectedIds.size;

    // bar aksi cuma tampil begitu minimal satu kartu dicentang
    selectionBar.hidden = count === 0;

    const allVisibleSelected = currentVisibleIds.length > 0 && currentVisibleIds.every(id => selectedIds.has(id));
    selectAllBtn.textContent = allVisibleSelected ? 'Batalkan semua' : 'Pilih semua';

    if (count === 0){
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    $('#selectionCountText').textContent = `${count} dipilih`;
    deleteSelectedBtn.textContent = `Hapus ${count} item`;

    selectAllCheckbox.checked = allVisibleSelected;
    selectAllCheckbox.indeterminate = !allVisibleSelected;
  }

  selectModeBtn.addEventListener('click', enterSelectMode);
  selectAllBtn.addEventListener('click', selectAllVisible);
  cancelSelectBtn.addEventListener('click', exitSelectMode);

  selectAllCheckbox.addEventListener('change', () => {
    if (selectAllCheckbox.checked){
      currentVisibleIds.forEach(id => selectedIds.add(id));
    } else {
      currentVisibleIds.forEach(id => selectedIds.delete(id));
    }
    renderHistory();
  });

  deleteSelectedBtn.addEventListener('click', async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const ok = confirm(`Yakin mau hapus ${count} riwayat yang dipilih? Nggak bisa dibalikin lagi lho.`);
    if (!ok) return;
    for (const id of selectedIds){
      await QRDatabase.deleteRecord(id);
    }
    toast(`${count} riwayat udah dihapus`);
    exitSelectMode();
    updateHistoryCount();
  });

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  $('#historySearch').addEventListener('input', renderHistory);
  $('#historyFilterType').addEventListener('change', renderHistory);

  $('#clearHistoryBtn').addEventListener('click', async () => {
    if (!confirm('Yakin mau hapus semua riwayat? Setelah ini nggak bisa dibalikin lagi lho.')) return;
    await QRDatabase.clearAll();
    renderHistory();
    updateHistoryCount();
    toast('Semua riwayat udah dikosongkan');
  });

  /* ---------------------- DETAIL MODAL ---------------------- */
  function openDetailModal(r){
    const modal = $('#detailModal');
    const body = $('#modalBody');
    const date = new Date(r.created_at);
    const dateStr = date.toLocaleString('id-ID', { dateStyle:'long', timeStyle:'short' });
    body.innerHTML = `
      <div class="modal-img"><img src="${r.thumbnail}" alt=""></div>
      <p class="modal-label">${escapeHtml(r.label || '(tanpa nama)')}</p>
      <p class="modal-type">${TYPE_LABELS[r.type] || r.type}</p>
      <div class="modal-data">${escapeHtml(r.payload)}</div>
      <div class="modal-actions">
        <button class="btn btn-primary btn-small" id="modalDownload">Unduh PNG</button>
        <button class="btn btn-ghost btn-small" id="modalCopyData">Salin data</button>
      </div>
      <p class="modal-date">Dibuat ${dateStr}</p>
    `;
    modal.hidden = false;
    $('#modalDownload').addEventListener('click', () => {
      const tmp = document.createElement('canvas');
      QRRenderer.render(tmp, r.payload, r.error_level || 'M', {
        fg: r.fg_color, bg: r.bg_color, dotStyle: r.dot_style, size: 1024
      });
      const link = document.createElement('a');
      link.download = `qr-${r.type}-${r.id}.png`;
      link.href = tmp.toDataURL('image/png');
      link.click();
    });
    $('#modalCopyData').addEventListener('click', async () => {
      await navigator.clipboard.writeText(r.payload);
      toast('Data disalin ke clipboard');
    });
  }
  $('#modalClose').addEventListener('click', () => { $('#detailModal').hidden = true; });
  $('#detailModal').addEventListener('click', (e) => {
    if (e.target.id === 'detailModal') $('#detailModal').hidden = true;
  });

  /* ---------------------- SCANNER ---------------------- */
  const dropzone = $('#scanDropzone');
  const scanInput = $('#scanFileInput');

  function handleScanFile(file){
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        const resultBox = $('#scanResult');
        const resultText = $('#scanResultText');
        const openBtn = $('#scanOpenBtn');
        if (code){
          resultBox.hidden = false;
          resultText.textContent = code.data;
          if (/^https?:\/\//i.test(code.data)){
            openBtn.hidden = false;
            openBtn.href = code.data;
          } else {
            openBtn.hidden = true;
          }
          toast('Kode QR-nya kebaca!');
        } else {
          resultBox.hidden = false;
          resultText.textContent = 'Tidak ada kode QR yang terdeteksi pada gambar ini.';
          openBtn.hidden = true;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener('click', (e) => {
    if (e.target !== scanInput) { /* label already triggers input */ }
  });
  scanInput.addEventListener('change', () => handleScanFile(scanInput.files[0]));
  ['dragover','dragenter'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
  });
  ['dragleave','drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-dragover'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    handleScanFile(file);
  });

  $('#scanCopyBtn').addEventListener('click', async () => {
    const text = $('#scanResultText').textContent;
    await navigator.clipboard.writeText(text);
    toast('Teks disalin');
  });

  /* ---------------------- INIT ---------------------- */
  async function boot(){
    // Peringatan dini bila pustaka QR gagal dimuat dari SEMUA sumber cadangan
    const libStatus = window.__LIB_STATUS__ || {};
    if (typeof qrcode !== 'function'){
      toast('Pustaka QR gagal dimuat dari semua sumber — periksa koneksi internet');
      console.error('qrcodejs tidak terdeteksi meski sudah mencoba beberapa CDN cadangan. Kemungkinan koneksi internet terputus atau firewall/proxy memblokir semua domain CDN yang dicoba.');
    }
    buildForm(currentType);
    try {
      await QRDatabase.init();
      dbReady = true;
      updateHistoryCount();
    } catch (e){
      dbReady = false;
      toast('Penyimpanan riwayat gagal dimuat — QR tetap bisa dibuat & diunduh');
      console.error('Gagal menginisialisasi penyimpanan riwayat:', e);
    }
  }

  boot();
})();