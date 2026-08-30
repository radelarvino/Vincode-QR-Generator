/* ============================================================
   db.js
   Lapisan basis data SQLite yang berjalan sepenuhnya di browser
   via sql.js (SQLite dikompilasi ke WebAssembly). Isi database
   disimpan sebagai berkas biner di IndexedDB agar riwayat
   bertahan setelah browser ditutup — sungguh SQLite, bukan
   sekadar localStorage.
   ============================================================ */

const QRDatabase = (() => {
  let SQL = null;
  let db = null;
  const IDB_NAME = 'modul-qr-store';
  const IDB_STORE = 'sqlite-files';
  const IDB_KEY = 'main.sqlite';

  function openIdb(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadBytesFromIdb(){
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveBytesToIdb(bytes){
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(bytes, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function persist(){
    const bytes = db.export();
    await saveBytesToIdb(bytes);
  }

  async function init(){
    if (typeof initSqlJs !== 'function'){
      throw new Error('SQLJS_NOT_LOADED');
    }
    SQL = await initSqlJs({
      locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
    });

    const existing = await loadBytesFromIdb();
    if (existing){
      db = new SQL.Database(new Uint8Array(existing));
    } else {
      db = new SQL.Database();
      db.run(`
        CREATE TABLE IF NOT EXISTS qr_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          form_data TEXT,
          fg_color TEXT,
          bg_color TEXT,
          dot_style TEXT,
          error_level TEXT,
          thumbnail TEXT,
          created_at TEXT NOT NULL
        );
      `);
      await persist();
    }
    // pastikan tabel ada meski file lama dimuat (migrasi ringan)
    db.run(`
      CREATE TABLE IF NOT EXISTS qr_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        form_data TEXT,
        fg_color TEXT,
        bg_color TEXT,
        dot_style TEXT,
        error_level TEXT,
        thumbnail TEXT,
        created_at TEXT NOT NULL
      );
    `);
    return true;
  }

  function run(sql, params = []){
    db.run(sql, params);
  }

  function query(sql, params = []){
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()){
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  async function insertRecord(record){
    run(
      `INSERT INTO qr_history (label, type, payload, form_data, fg_color, bg_color, dot_style, error_level, thumbnail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.label || '',
        record.type,
        record.payload,
        JSON.stringify(record.formData || {}),
        record.fgColor,
        record.bgColor,
        record.dotStyle,
        record.errorLevel,
        record.thumbnail || '',
        new Date().toISOString()
      ]
    );
    await persist();
    const rows = query('SELECT last_insert_rowid() as id');
    return rows[0].id;
  }

  function getAll(){
    if (!db) return []; // belum siap (mis. init() masih jalan/gagal) -> anggap riwayat kosong, jangan crash
    return query('SELECT * FROM qr_history ORDER BY id DESC');
  }

  async function deleteRecord(id){
    run('DELETE FROM qr_history WHERE id = ?', [id]);
    await persist();
  }

  async function clearAll(){
    run('DELETE FROM qr_history');
    await persist();
  }

  function exportDbFile(){
    return db.export();
  }

  return { init, insertRecord, getAll, deleteRecord, clearAll, exportDbFile };
})();
