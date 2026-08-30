/* ============================================================
   qr-engine.js
   - Mengubah input form per-tipe menjadi string payload QR
   - Merender QR ke canvas dengan gaya modul kustom (kotak/bulat/membulat)
   - Menambahkan logo di tengah bila ada
   ============================================================ */

/* ------------------------------------------------------------
   Template desain siap pakai — tiap template berisi kombinasi
   warna modul/latar, bentuk modul, dan level ketahanan yang
   sudah dipadupadankan supaya QR tetap gampang dipindai sekaligus
   enak dilihat. Dikelompokkan per suasana pemakaian.
   ------------------------------------------------------------ */
const QRTemplates = [
  {
    id: 'klasik',
    name: 'Klasik',
    group: 'Netral',
    fg: '#0F1216', bg: '#FFFFFF', dotStyle: 'square', errorLevel: 'M'
  },
  {
    id: 'bisnis',
    name: 'Bisnis',
    group: 'Profesional',
    fg: '#1E293B', bg: '#F8FAFC', dotStyle: 'square', errorLevel: 'Q'
  },
  {
    id: 'korporat-biru',
    name: 'Korporat Biru',
    group: 'Profesional',
    fg: '#0C4A6E', bg: '#F0F9FF', dotStyle: 'rounded', errorLevel: 'Q'
  },
  {
    id: 'elegan',
    name: 'Elegan Emas',
    group: 'Event',
    fg: '#3B2F1E', bg: '#FDF8F0', dotStyle: 'rounded', errorLevel: 'M'
  },
  {
    id: 'pernikahan',
    name: 'Pernikahan',
    group: 'Event',
    fg: '#5B4636', bg: '#FBF0F3', dotStyle: 'dots', errorLevel: 'M'
  },
  {
    id: 'kafe',
    name: 'Kafe Hangat',
    group: 'F&B',
    fg: '#6B3F2A', bg: '#FFF6EC', dotStyle: 'rounded', errorLevel: 'M'
  },
  {
    id: 'restoran',
    name: 'Menu Resto',
    group: 'F&B',
    fg: '#2D2A26', bg: '#FAF4E8', dotStyle: 'square', errorLevel: 'Q'
  },
  {
    id: 'segar',
    name: 'Segar Hijau',
    group: 'F&B',
    fg: '#14532D', bg: '#F0FDF4', dotStyle: 'dots', errorLevel: 'M'
  },
  {
    id: 'sosial',
    name: 'Sosial Media',
    group: 'Promosi',
    fg: '#7C2D92', bg: '#FDF4FF', dotStyle: 'dots', errorLevel: 'M'
  },
  {
    id: 'promo',
    name: 'Promo Sale',
    group: 'Promosi',
    fg: '#B91C1C', bg: '#FEF2F2', dotStyle: 'square', errorLevel: 'H'
  },
  {
    id: 'energik',
    name: 'Energik Oranye',
    group: 'Promosi',
    fg: '#9A3412', bg: '#FFF7ED', dotStyle: 'rounded', errorLevel: 'M'
  },
  {
    id: 'malam',
    name: 'Mode Malam',
    group: 'Kontras Tinggi',
    fg: '#FFFFFF', bg: '#0B0D10', dotStyle: 'rounded', errorLevel: 'Q'
  }
];

const QRField = {
  /* Definisi field per tipe: dipakai untuk membangun form dinamis */
  schema: {
    url: [
      { key: 'url', label: 'Alamat tautan', type: 'url', placeholder: 'https://contoh.com', required: true }
    ],
    text: [
      { key: 'text', label: 'Isi teks', type: 'textarea', placeholder: 'Tulis pesan atau catatan bebas…', required: true }
    ],
    wifi: [
      { key: 'ssid', label: 'Nama jaringan (SSID)', type: 'text', placeholder: 'Wifi-Rumah', required: true },
      { key: 'password', label: 'Kata sandi', type: 'text', placeholder: 'Kosongkan jika terbuka' },
      { key: 'encryption', label: 'Jenis keamanan', type: 'radio', options: [
          { value: 'WPA', label: 'WPA/WPA2' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Terbuka' }
        ], default: 'WPA' },
      { key: 'hidden', label: 'Jaringan tersembunyi', type: 'checkbox' }
    ],
    vcard: [
      { key: 'name', label: 'Nama lengkap', type: 'text', placeholder: 'Ayu Lestari', required: true },
      { key: 'org', label: 'Organisasi', type: 'text', placeholder: 'PT Contoh Sejahtera' },
      { key: 'phone', label: 'Telepon', type: 'tel', placeholder: '+62 812-0000-0000' },
      { key: 'email', label: 'Surel', type: 'email', placeholder: 'ayu@contoh.com' },
      { key: 'address', label: 'Alamat', type: 'text', placeholder: 'Jl. Contoh No. 1, Jakarta' }
    ],
    email: [
      { key: 'to', label: 'Kepada', type: 'email', placeholder: 'penerima@contoh.com', required: true },
      { key: 'subject', label: 'Subjek', type: 'text', placeholder: 'Perihal…' },
      { key: 'body', label: 'Isi pesan', type: 'textarea', placeholder: 'Tulis isi surel…' }
    ],
    phone: [
      { key: 'phone', label: 'Nomor telepon', type: 'tel', placeholder: '+62 812-0000-0000', required: true }
    ]
  },

  /* Membangun payload string sesuai standar tiap tipe */
  buildPayload(type, data){
    switch(type){
      case 'url': {
        let v = (data.url || '').trim();
        if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
        return v;
      }
      case 'text':
        return (data.text || '').trim();
      case 'wifi': {
        const esc = s => (s||'').replace(/([\\;,:"])/g, '\\$1');
        const enc = data.encryption || 'WPA';
        const hidden = data.hidden ? 'true' : 'false';
        if (enc === 'nopass') return `WIFI:T:nopass;S:${esc(data.ssid)};H:${hidden};;`;
        return `WIFI:T:${enc};S:${esc(data.ssid)};P:${esc(data.password)};H:${hidden};;`;
      }
      case 'vcard': {
        const lines = ['BEGIN:VCARD','VERSION:3.0'];
        if (data.name) lines.push(`N:${data.name};;;`, `FN:${data.name}`);
        if (data.org) lines.push(`ORG:${data.org}`);
        if (data.phone) lines.push(`TEL;TYPE=CELL:${data.phone}`);
        if (data.email) lines.push(`EMAIL:${data.email}`);
        if (data.address) lines.push(`ADR:;;${data.address};;;;`);
        lines.push('END:VCARD');
        return lines.join('\n');
      }
      case 'email': {
        const params = [];
        if (data.subject) params.push('subject=' + encodeURIComponent(data.subject));
        if (data.body) params.push('body=' + encodeURIComponent(data.body));
        const q = params.length ? '?' + params.join('&') : '';
        return `mailto:${(data.to||'').trim()}${q}`;
      }
      case 'phone':
        return `tel:${(data.phone||'').trim()}`;
      default:
        return '';
    }
  },

  /* Ringkasan singkat untuk ditampilkan di preview/riwayat */
  summarize(type, data){
    switch(type){
      case 'url': return data.url || '';
      case 'text': return data.text || '';
      case 'wifi': return `Jaringan "${data.ssid || '?'}"`;
      case 'vcard': return data.name || '';
      case 'email': return data.to || '';
      case 'phone': return data.phone || '';
      default: return '';
    }
  }
};

/* ------------------------------------------------------------
   Renderer: pakai lib qrcodejs untuk hitung matriks modul,
   lalu gambar sendiri ke canvas supaya bisa custom bentuk & warna.
   ------------------------------------------------------------ */
const QRRenderer = {
  /**
   * Menghasilkan matriks boolean QR dari payload.
   */
  getMatrix(text, errorLevel){
    if (typeof qrcode !== 'function'){
      throw new Error('LIBRARY_NOT_LOADED');
    }
    const ecLevelMap = { L: 'L', M: 'M', Q: 'Q', H: 'H' };
    const ec = ecLevelMap[errorLevel] || 'M';
    // Library qrcodejs tidak punya mode "auto" (typeNumber 0) yang andal —
    // coba tiap versi (1..40) sampai data muat, mulai dari yang terkecil.
    let qr = null;
    let lastError = null;
    for (let typeNumber = 1; typeNumber <= 40; typeNumber++){
      try {
        const candidate = qrcode(typeNumber, ec);
        candidate.addData(text);
        candidate.make();
        qr = candidate;
        break;
      } catch (e){
        lastError = e;
      }
    }
    if (!qr){
      throw new Error('DATA_TOO_LONG');
    }
    const count = qr.getModuleCount();
    const matrix = [];
    for (let r = 0; r < count; r++){
      const row = [];
      for (let c = 0; c < count; c++){
        row.push(qr.isDark(r, c));
      }
      matrix.push(row);
    }
    return matrix;
  },

  /**
   * Menggambar QR ke canvas dengan gaya modul kustom.
   * opts: { fg, bg, dotStyle, size, logoImg, quietZone }
   */
  render(canvas, text, errorLevel, opts){
    const matrix = this.getMatrix(text, errorLevel);
    const n = matrix.length;
    const size = opts.size || 480;
    const quiet = 2; // modul kosong di tepi
    const totalModules = n + quiet * 2;
    const moduleSize = size / totalModules;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    // background
    ctx.fillStyle = opts.bg || '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = opts.fg || '#000000';

    const isFinder = (r, c) => {
      // three finder pattern zones (7x7 at corners)
      const inZone = (rr, cc) => rr >= 0 && rr < 7 && cc >= 0 && cc < 7;
      return inZone(r, c) || inZone(r, c - (n - 7)) || inZone(r - (n - 7), c);
    };

    for (let r = 0; r < n; r++){
      for (let c = 0; c < n; c++){
        if (!matrix[r][c]) continue;
        if (isFinder(r, c)) continue; // gambar finder terpisah agar rapi
        const x = (c + quiet) * moduleSize;
        const y = (r + quiet) * moduleSize;
        this._drawModule(ctx, x, y, moduleSize, opts.dotStyle);
      }
    }

    // gambar tiga finder pattern (pojok) dengan gaya konsisten & jelas
    const finderPositions = [
      [0, 0], [0, n - 7], [n - 7, 0]
    ];
    finderPositions.forEach(([fr, fc]) => {
      this._drawFinder(ctx, (fc + quiet) * moduleSize, (fr + quiet) * moduleSize, moduleSize, opts.fg, opts.bg, opts.dotStyle);
    });

    // logo di tengah
    if (opts.logoImg){
      const logoSize = size * 0.22;
      const cx = (size - logoSize) / 2;
      const cy = (size - logoSize) / 2;
      const pad = logoSize * 0.14;
      ctx.fillStyle = opts.bg || '#ffffff';
      this._roundRect(ctx, cx - pad, cy - pad, logoSize + pad*2, logoSize + pad*2, 10);
      ctx.fill();
      ctx.save();
      this._roundRect(ctx, cx, cy, logoSize, logoSize, 8);
      ctx.clip();
      ctx.drawImage(opts.logoImg, cx, cy, logoSize, logoSize);
      ctx.restore();
    }
  },

  _drawModule(ctx, x, y, s, style){
    const pad = s * 0.06;
    switch(style){
      case 'dots': {
        ctx.beginPath();
        ctx.arc(x + s/2, y + s/2, (s - pad*2)/2, 0, Math.PI*2);
        ctx.fill();
        break;
      }
      case 'rounded': {
        this._roundRect(ctx, x + pad, y + pad, s - pad*2, s - pad*2, s*0.28);
        ctx.fill();
        break;
      }
      default: {
        ctx.fillRect(x, y, s, s);
      }
    }
  },

  _drawFinder(ctx, x, y, m, fg, bg, style){
    const outer = 7 * m;
    const round = style !== 'square';
    // outer ring
    ctx.fillStyle = fg;
    if (round){
      this._roundRect(ctx, x, y, outer, outer, m*1.6); ctx.fill();
    } else {
      ctx.fillRect(x, y, outer, outer);
    }
    // inner white gap
    ctx.fillStyle = bg;
    if (round){
      this._roundRect(ctx, x+m, y+m, outer-2*m, outer-2*m, m*1.1); ctx.fill();
    } else {
      ctx.fillRect(x+m, y+m, outer-2*m, outer-2*m);
    }
    // center block
    ctx.fillStyle = fg;
    if (round){
      this._roundRect(ctx, x+2*m, y+2*m, outer-4*m, outer-4*m, m*0.8); ctx.fill();
    } else {
      ctx.fillRect(x+2*m, y+2*m, outer-4*m, outer-4*m);
    }
  },

  _roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  },

  /**
   * Menghasilkan string SVG dari matriks (untuk unduh vektor).
   */
  toSVG(text, errorLevel, opts){
    const matrix = this.getMatrix(text, errorLevel);
    const n = matrix.length;
    const quiet = 2;
    const total = n + quiet*2;
    const m = 10; // unit per modul dalam viewBox
    const size = total * m;
    let shapes = '';
    const isFinder = (r, c) => {
      const inZone = (rr, cc) => rr >= 0 && rr < 7 && cc >= 0 && cc < 7;
      return inZone(r, c) || inZone(r, c - (n - 7)) || inZone(r - (n - 7), c);
    };
    for (let r = 0; r < n; r++){
      for (let c = 0; c < n; c++){
        if (!matrix[r][c] || isFinder(r,c)) continue;
        const x = (c+quiet)*m, y = (r+quiet)*m;
        if (opts.dotStyle === 'dots'){
          shapes += `<circle cx="${x+m/2}" cy="${y+m/2}" r="${m*0.42}" fill="${opts.fg}"/>`;
        } else if (opts.dotStyle === 'rounded'){
          shapes += `<rect x="${x+m*0.06}" y="${y+m*0.06}" width="${m*0.88}" height="${m*0.88}" rx="${m*0.28}" fill="${opts.fg}"/>`;
        } else {
          shapes += `<rect x="${x}" y="${y}" width="${m}" height="${m}" fill="${opts.fg}"/>`;
        }
      }
    }
    const finderPositions = [[0,0],[0,n-7],[n-7,0]];
    finderPositions.forEach(([fr,fc]) => {
      const x=(fc+quiet)*m, y=(fr+quiet)*m, outer=7*m;
      const rr = opts.dotStyle === 'square' ? 0 : m*1.6;
      shapes += `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${rr}" fill="${opts.fg}"/>`;
      shapes += `<rect x="${x+m}" y="${y+m}" width="${outer-2*m}" height="${outer-2*m}" rx="${rr*0.7}" fill="${opts.bg}"/>`;
      shapes += `<rect x="${x+2*m}" y="${y+2*m}" width="${outer-4*m}" height="${outer-4*m}" rx="${rr*0.5}" fill="${opts.fg}"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${opts.bg}"/>${shapes}</svg>`;
  }
};
