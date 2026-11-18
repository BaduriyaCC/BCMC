/**
 * Baduriya Media Portal — shared drafts (Google Apps Script)
 * ---------------------------------------------------------
 * Stores the Media Unit's drafts in one Google Drive folder so every
 * member's phone / PC sees and edits the same drafts.
 *
 * Setup (once, with the school Google account):
 *   1. script.google.com → New project → paste this whole file → Save.
 *   2. Type a unit code below (e.g. 'BCMC26'). Media Unit members type the same
 *      code once in the portal's Settings. It is required for photo upload &
 *      review links (it stops link holders from managing events).
 *   3. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *      → Deploy → Authorize → copy the Web app URL.
 *   4. In the portal: 🔒 Settings → Shared drafts → paste the URL → Test → Save.
 *
 * Members never sign in to Google. Only the account owner can see the files in Drive.
 *
 * VERSION 2 adds 📤 photo upload links and ❤️ review links (one Drive folder per event).
 * VERSION 5 adds Google Drive photo links in 📋 details requests.
 * VERSION 4 adds the SHARED Photo Studio: edits and labels sync between devices, photos
 *   dropped straight into an event's Drive folder (or a sub-folder like "temp") join the
 *   event, and each photo gets ONE finished copy in "✨ Final (edited & labelled)".
 * If you already set this up: paste this new file over the old one → Save →
 * Deploy → Manage deployments → ✎ Edit → Version: "New version" → Deploy.
 * (The Web app URL stays the same.)
 * Photos stay PRIVATE in your Drive — nothing is shared publicly; people only see
 * them through the portal links you send.
 */
const UNIT_CODE = '';                       // e.g. 'BCMC26' — REQUIRED for photo upload & review links
const FOLDER_NAME = 'Baduriya Media Portal - shared drafts';
const MAX_DRAFTS = 300;
// FUTURE (school Google Workspace, 100 TB): paste the ID of the school Shared Drive / folder here
// and every portal folder is made inside it. Leave empty to use this Gmail's own Drive.
const ROOT_FOLDER_ID = '';
const TIMEZONE = 'Asia/Colombo';
function home_() { if (ROOT_FOLDER_ID) { try { return DriveApp.getFolderById(ROOT_FOLDER_ID); } catch (e) {} } return null; }
function top_(name) { const r = home_(); const it = r ? r.getFoldersByName(name) : DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : (r ? r.createFolder(name) : DriveApp.createFolder(name)); }

function folder_() { return top_(FOLDER_NAME); }
function readIndex_(f) {
  const it = f.getFilesByName('index.json');
  if (!it.hasNext()) return {};
  try { return JSON.parse(it.next().getBlob().getDataAsString() || '{}'); } catch (e) { return {}; }
}
function writeIndex_(f, index) {
  const it = f.getFilesByName('index.json');
  if (it.hasNext()) it.next().setContent(JSON.stringify(index));
  else f.createFile('index.json', JSON.stringify(index), MimeType.PLAIN_TEXT);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function cleanId_(s) { return String(s || '').replace(/[^\w-]/g, '').slice(0, 48); }

function doGet() { return out_({ ok: true, app: 'baduriya-media-portal', v: 2, protected: !!UNIT_CODE }); }

function doPost(e) {
  let q;
  try { q = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad request' }); }
  if (String(q.action || '').indexOf('ph_') === 0) return photos_(q);
  if (String(q.action || '').indexOf('ap_') === 0) return approvals_(q);
  if (String(q.action || '').indexOf('rem_') === 0) return reminders_(q);
  if (q.action === 'drive_img') return driveImg_(q);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const f = folder_(), index = readIndex_(f), id = cleanId_(q.id), now = Date.now();
    const codeOk = !UNIT_CODE || q.code === UNIT_CODE;
    switch (q.action) {
      case 'ping':
        { let used = 0, limit = 0; try { used = DriveApp.getStorageUsed(); limit = DriveApp.getStorageLimit(); } catch (e) {}
          return out_({ ok: true, v: 5, protected: !!UNIT_CODE, codeOk: codeOk, count: Object.keys(index).length, used: used, limit: limit, root: ROOT_FOLDER_ID ? 'school' : 'gmail' }); }
      case 'list': {
        if (!codeOk) return out_({ ok: false, error: 'code' });
        const items = Object.keys(index).map(k => Object.assign({ id: k }, index[k])).sort((a, b) => (b.updated || 0) - (a.updated || 0));
        return out_({ ok: true, items: items });
      }
      case 'meta':
        return out_({ ok: true, meta: index[id] || null });
      case 'get': {
        if (!id || !index[id]) return out_({ ok: false, error: 'not found' });
        const it = f.getFilesByName(id + '.json');
        if (!it.hasNext()) return out_({ ok: false, error: 'not found' });
        return out_({ ok: true, meta: index[id], draft: it.next().getBlob().getDataAsString() });
      }
      case 'put': {
        if (!id) return out_({ ok: false, error: 'no id' });
        if (!codeOk && !index[id]) return out_({ ok: false, error: 'code' });   // a shared link may save back to its own draft
        const old = f.getFilesByName(id + '.json');
        while (old.hasNext()) old.next().setTrashed(true);
        f.createFile(Utilities.newBlob(String(q.draft || ''), 'application/json', id + '.json'));
        const keepLock = index[id] && index[id].lock;
        index[id] = Object.assign({}, q.meta || {}, { saved: now, lock: q.lockBy ? { by: String(q.lockBy).slice(0, 40), at: now } : (keepLock || null) });
        // keep the folder tidy
        const ids = Object.keys(index).sort((a, b) => (index[b].updated || 0) - (index[a].updated || 0));
        ids.slice(MAX_DRAFTS).forEach(k => { const o = f.getFilesByName(k + '.json'); while (o.hasNext()) o.next().setTrashed(true); delete index[k]; });
        writeIndex_(f, index);
        return out_({ ok: true, saved: now });
      }
      case 'lock': {
        if (index[id]) { index[id].lock = q.by ? { by: String(q.by).slice(0, 40), at: now } : null; writeIndex_(f, index); }
        return out_({ ok: true });
      }
      case 'del': {
        if (!codeOk) return out_({ ok: false, error: 'code' });
        const o = f.getFilesByName(id + '.json'); while (o.hasNext()) o.next().setTrashed(true);
        delete index[id]; writeIndex_(f, index);
        return out_({ ok: true });
      }
    }
    return out_({ ok: false, error: 'unknown action' });
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
   📤 UPLOAD & ❤️ REVIEW — one folder per event
   ===================================================================== */
const PHOTO_ROOT = 'Baduriya Media Portal - event photos';
const MAX_UPLOAD_MB = 40;

function photoRoot_() { return top_(PHOTO_ROOT); }
function sub_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function dataDir_() { return sub_(photoRoot_(), '_portal data (do not edit)'); }
function readJson_(dir, name, def) { const it = dir.getFilesByName(name); if (!it.hasNext()) return def; try { return JSON.parse(it.next().getBlob().getDataAsString() || 'null') || def; } catch (e) { return def; } }
function writeJson_(dir, name, obj) { const it = dir.getFilesByName(name); const s = JSON.stringify(obj); if (it.hasNext()) it.next().setContent(s); else dir.createFile(name, s, MimeType.PLAIN_TEXT); }
function key_() { const c = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 12; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }
function role_(ev, q) {
  if (UNIT_CODE && q.code === UNIT_CODE) return 'admin';
  if (q.key && q.key === ev.rkey) return 'review';
  if (q.key && q.key === ev.ukey) return 'upload';
  return '';
}
function pub_(ev, role) {
  const o = { id: ev.id, name: ev.name, date: ev.date, need: ev.need, reviewers: ev.reviewers, parts: ev.parts || [], times: ev.times || [], plan: ev.plan || '', keep: ev.keep || 2, created: ev.created, role: role, closed: !!ev.closed };
  if (role === 'admin') { o.ukey = ev.ukey; o.rkey = ev.rkey; o.folderUrl = DriveApp.getFolderById(ev.folder).getUrl(); }
  return o;
}
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(28000); try { return fn(); } finally { l.releaseLock(); } }

/** photos dropped straight into the event folder (or a sub-folder such as "temp") join the event */
function scanFolder_(ev, d) {
  const root = DriveApp.getFolderById(ev.folder), have = {}, added = [], t0 = Date.now();
  d.photos.forEach(p => { have[p.f] = 1; if (p.e) have[p.e] = 1; if (p.t) have[p.t] = 1; });
  const walk = (f, depth) => {
    const it = f.getFiles();
    while (it.hasNext() && added.length < 40 && Date.now() - t0 < 15000) { const x = it.next(), id = x.getId();
      if (have[id] || !/^image\//.test(x.getMimeType())) continue; have[id] = 1;
      added.push({ f: id, t: '', n: x.getName(), by: 'Drive' + (depth ? ' · ' + f.getName() : ''), part: '', taken: x.getDateCreated().getTime(), w: 0, h: 0, size: x.getSize(), at: Date.now(), drive: 1 }); }
    if (depth < 2) { const fs = f.getFolders(); while (fs.hasNext()) { const s2 = fs.next(), n = s2.getName(); if (n === '_thumbs' || n.indexOf('✨') === 0) continue; walk(s2, depth + 1); } }
  };
  walk(root, 0); return added;
}
/** 📋 details request: open a Google Drive photo (or a folder of photos) from a link the teacher sent.
 *  The photo must be shared with this Google account or with "Anyone with the link". */
function driveImg_(q) {
  try {
    if (UNIT_CODE && q.code !== UNIT_CODE) return out_({ ok: false, error: 'Unit code needed for photo links' });
    const out = [], add = f => { if (!/^image\//.test(f.getMimeType()) || f.getSize() > 12 * 1048576) return false; const b = f.getBlob();
      out.push({ name: f.getName(), data: 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes()) }); return true; };
    if (q.folder) { const it = DriveApp.getFolderById(String(q.folder)).getFiles(); let n = 0; while (it.hasNext() && n < 12) { if (add(it.next())) n++; } }
    else add(DriveApp.getFileById(String(q.id || '')));
    if (!out.length) return out_({ ok: false, error: 'No photo found at this link' });
    return out_({ ok: true, images: out });
  } catch (e) { return out_({ ok: false, error: 'Cannot open this Drive link' }); }
}
function photos_(q) {
  try {
    const D = dataDir_(), act = q.action;
    if (!UNIT_CODE && (act === 'ph_create' || act === 'ph_events')) return out_({ ok: false, error: 'nocode' });
    if (act === 'ph_create') {
      if (q.code !== UNIT_CODE) return out_({ ok: false, error: 'code' });
      return withLock_(() => {
        const list = readJson_(D, 'events.json', {}), id = 'e' + Date.now().toString(36);
        const name = String(q.name || 'Event').slice(0, 80), date = String(q.date || '').slice(0, 10);
        const folder = photoRoot_().createFolder((date ? date + ' ' : '') + name.replace(/[\\/:*?"<>|]/g, ''));
        const ev = { id: id, name: name, date: date, folder: folder.getId(), ukey: key_(), rkey: key_(), created: Date.now(),
          need: Math.max(1, Math.min(6, +q.need || 2)), keep: Math.max(1, Math.min(6, +q.keep || 2)),
          reviewers: (q.reviewers || ['Principal', 'Vice Principal', 'Deputy Principal', 'Teacher']).slice(0, 8).map(String), parts: (q.parts || []).slice(0, 30).map(String), times: (q.times || []).slice(0, 30).map(String), plan: String(q.plan || '').slice(0, 40) };
        list[id] = ev; writeJson_(D, 'events.json', list); writeJson_(D, id + '.json', { photos: [], votes: {}, done: {} });
        return out_({ ok: true, event: pub_(ev, 'admin') });
      });
    }
    if (act === 'ph_events') {
      if (q.code !== UNIT_CODE) return out_({ ok: false, error: 'code' });
      const list = readJson_(D, 'events.json', {});
      const items = Object.keys(list).map(k => { const ev = list[k], d = readJson_(D, k + '.json', { photos: [], votes: {}, done: {} }); const o = pub_(ev, 'admin'); o.count = d.photos.length; o.done = d.done; o.votes = d.votes; o.list = d.photos.map(p => p.f); return o; })
        .sort((a, b) => b.created - a.created);
      return out_({ ok: true, items: items });
    }
    const list = readJson_(D, 'events.json', {}), ev = list[String(q.id || '')];
    if (!ev) return out_({ ok: false, error: 'This link is no longer active' });
    const role = role_(ev, q); if (!role) return out_({ ok: false, error: 'This link is not valid' });
    const can = r => role === 'admin' || role === r;
    if (act === 'ph_info') return out_({ ok: true, event: pub_(ev, role) });
    if (act === 'ph_up') {
      if (!can('upload') && !can('review')) return out_({ ok: false, error: 'not allowed' });
      if (ev.closed && role !== 'admin') return out_({ ok: false, error: 'Uploads for this event are closed' });
      const bytes = Utilities.base64Decode(String(q.data || ''));
      if (!bytes.length) return out_({ ok: false, error: 'empty file' });
      if (bytes.length > MAX_UPLOAD_MB * 1048576) return out_({ ok: false, error: 'file too big' });
      const folder = DriveApp.getFolderById(ev.folder), by = String(q.by || '').slice(0, 40);
      const fname = String(q.fname || 'photo.jpg').replace(/[\\/:*?"<>|]/g, '').slice(0, 90);
      const file = folder.createFile(Utilities.newBlob(bytes, String(q.mime || 'image/jpeg'), fname));
      file.setDescription('Uploaded by ' + (by || 'someone') + (q.part ? ' · ' + q.part : '') + ' via Baduriya Media Portal');
      let th = '';
      if (q.thumb) { const t = sub_(folder, '_thumbs').createFile(Utilities.newBlob(Utilities.base64Decode(q.thumb), 'image/jpeg', file.getId() + '.jpg')); th = t.getId(); }
      return withLock_(() => {
        const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} });
        d.photos.push({ f: file.getId(), t: th, n: fname, by: by, part: String(q.part || '').slice(0, 60), taken: +q.taken || 0, w: +q.w || 0, h: +q.h || 0, size: bytes.length, at: Date.now(),
          m: q.m || null });
        writeJson_(D, ev.id + '.json', d);
        return out_({ ok: true, f: file.getId(), count: d.photos.length });
      });
    }
    if (act === 'ph_import') {
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      const m = /[-\w]{25,}/.exec(String(q.folderUrl || '')); if (!m) return out_({ ok: false, error: 'Not a Drive folder link' });
      const src = DriveApp.getFolderById(m[0]), folder = DriveApp.getFolderById(ev.folder), thumbs = sub_(folder, '_thumbs');
      const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }), have = {}; d.photos.forEach(p => { if (p.src) have[p.src] = 1; });
      const it = src.getFiles(), added = []; let left = 0; const t0 = Date.now();
      while (it.hasNext()) { const f = it.next(); if (!/^image\//.test(f.getMimeType()) || have[f.getId()]) continue;
        if (Date.now() - t0 > 240000) { left++; continue; }
        const c = f.makeCopy(f.getName(), folder); let th = ''; try { const tb = c.getThumbnail(); if (tb) th = thumbs.createFile(tb.setName(c.getId() + '.png')).getId(); } catch (e) {}
        added.push({ f: c.getId(), t: th, n: f.getName(), by: 'Drive folder', part: '', taken: f.getDateCreated().getTime(), w: 0, h: 0, size: f.getSize(), at: Date.now(), src: f.getId() }); }
      return withLock_(() => { const d2 = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }); d2.photos = d2.photos.concat(added); writeJson_(D, ev.id + '.json', d2); return out_({ ok: true, added: added.length, left: left }); });
    }
    if (act === 'ph_list') {
      if (!can('review')) return out_({ ok: false, error: 'not allowed' });
      let d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} });
      if (q.scan && role === 'admin' && Date.now() - (d.scanAt || 0) > (q.scan === 'force' ? 3000 : 40000)) {
        const added = scanFolder_(ev, d);
        d = withLock_(() => { const d2 = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }), have = {}; d2.photos.forEach(p => have[p.f] = 1);
          d2.photos = d2.photos.concat(added.filter(p => !have[p.f])); d2.scanAt = Date.now(); writeJson_(D, ev.id + '.json', d2); return d2; });
      }
      return out_({ ok: true, event: pub_(ev, role), photos: d.photos, votes: d.votes, done: d.done });
    }
    if (act === 'ph_thumbs' || act === 'ph_img') {
      if (!can('review')) return out_({ ok: false, error: 'not allowed' });
      const d = readJson_(D, ev.id + '.json', { photos: [] }), ok = {}; d.photos.forEach(p => { ok[p.f] = p.t || ''; if (p.e) ok[p.e] = ''; });
      const ids = (act === 'ph_img' ? [q.f] : (q.ids || [])).slice(0, 30), res = {};
      ids.forEach(id => { if (!(id in ok)) return; try {
        let blob;
        if (act === 'ph_img') blob = DriveApp.getFileById(id).getBlob();
        else if (ok[id]) blob = DriveApp.getFileById(ok[id]).getBlob();
        else blob = DriveApp.getFileById(id).getThumbnail();
        if (blob) res[id] = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
      } catch (e) {} });
      return out_({ ok: true, images: res });
    }
    if (act === 'ph_vote') {
      if (!can('review')) return out_({ ok: false, error: 'not allowed' });
      const who = String(q.who || '').slice(0, 40); if (!who) return out_({ ok: false, error: 'Choose your name first' });
      return withLock_(() => {
        const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} });
        (q.votes || []).forEach(v => { const f = String(v.f || ''); if (!f) return; d.votes[f] = d.votes[f] || {}; if (v.v) d.votes[f][who] = v.v > 0 ? 1 : -1; else delete d.votes[f][who]; });
        if (q.done != null) { if (q.done) d.done[who] = Date.now(); else delete d.done[who]; }
        writeJson_(D, ev.id + '.json', d);
        return out_({ ok: true, votes: d.votes, done: d.done });
      });
    }
    if (act === 'ph_edit') {
      // shared Photo Studio: edits (sliders, crop) and labels are saved as small settings — no new files
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      return withLock_(() => {
        const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }), by = String(q.by || '').slice(0, 40), now = Date.now(), done = [];
        (q.edits || []).slice(0, 100).forEach(x => { const p = d.photos.filter(y => y.f === String(x.f || ''))[0]; if (!p) return;
          if (x.adj !== undefined) p.adj = x.adj ? String(x.adj).slice(0, 8000) : '';
          if (x.lab !== undefined) p.lab = x.lab ? { label: String(x.lab.label || '').slice(0, 140), desc: String(x.lab.desc || '').slice(0, 240) } : null;
          p.eb = by; p.ea = now; done.push(p.f); });
        writeJson_(D, ev.id + '.json', d);
        return out_({ ok: true, saved: done, at: now });
      });
    }
    if (act === 'ph_final') {
      // one finished (edited + labelled) copy per photo: saving again replaces it, nothing is duplicated
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      const bytes = Utilities.base64Decode(String(q.data || '')); if (!bytes.length) return out_({ ok: false, error: 'empty file' });
      const d0 = readJson_(D, ev.id + '.json', { photos: [] }), p0 = d0.photos.filter(y => y.f === String(q.f || ''))[0];
      if (!p0) return out_({ ok: false, error: 'photo not found' });
      const dir = sub_(DriveApp.getFolderById(ev.folder), '✨ Final (edited & labelled)');
      const name = String(p0.n || 'photo').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '') + '.jpg';
      const file = dir.createFile(Utilities.newBlob(bytes, String(q.mime || 'image/jpeg'), name));
      file.setDescription('Edited / labelled with Baduriya Media Portal by ' + String(q.by || 'the Media Unit').slice(0, 40));
      return withLock_(() => { const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }), p = d.photos.filter(y => y.f === p0.f)[0];
        if (p.e && p.e !== file.getId()) { try { DriveApp.getFileById(p.e).setTrashed(true); } catch (e) {} }
        p.e = file.getId(); p.fa = Date.now(); writeJson_(D, ev.id + '.json', d);
        return out_({ ok: true, e: p.e, folderUrl: dir.getUrl() }); });
    }
    if (act === 'ph_update') {
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      return withLock_(() => { const l2 = readJson_(D, 'events.json', {}), e2 = l2[ev.id];
        ['name', 'need', 'keep', 'reviewers', 'parts', 'closed'].forEach(k => { if (q[k] != null) e2[k] = q[k]; });
        if (q.newKeys) { e2.ukey = key_(); e2.rkey = key_(); }
        writeJson_(D, 'events.json', l2); return out_({ ok: true, event: pub_(e2, 'admin') }); });
    }
    if (act === 'ph_sort') {
      // move photos into ✅ Approved / 🤔 Maybe / ❌ Not chosen (nothing is deleted)
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      const folder = DriveApp.getFolderById(ev.folder), names = { keep: '✅ Approved', maybe: '🤔 Maybe', drop: '❌ Not chosen' }, moved = { keep: 0, maybe: 0, drop: 0 };
      Object.keys(q.groups || {}).forEach(g => { if (!names[g]) return; const to = sub_(folder, names[g]);
        (q.groups[g] || []).forEach(id => { try { DriveApp.getFileById(id).moveTo(to); moved[g]++; } catch (e) {} }); });
      return out_({ ok: true, moved: moved, folderUrl: folder.getUrl() });
    }
    if (act === 'ph_trash') {
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      let n = 0; (q.ids || []).forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); n++; } catch (e) {} });
      return withLock_(() => { const d = readJson_(D, ev.id + '.json', { photos: [], votes: {}, done: {} }), gone = {}; (q.ids || []).forEach(i => gone[i] = 1);
        d.photos = d.photos.filter(p => !gone[p.f]); writeJson_(D, ev.id + '.json', d); return out_({ ok: true, trashed: n }); });
    }
    if (act === 'ph_delete_event') {
      if (role !== 'admin') return out_({ ok: false, error: 'not allowed' });
      return withLock_(() => { const l2 = readJson_(D, 'events.json', {}); try { DriveApp.getFolderById(ev.folder).setTrashed(true); } catch (e) {}
        delete l2[ev.id]; writeJson_(D, 'events.json', l2); const o = D.getFilesByName(ev.id + '.json'); while (o.hasNext()) o.next().setTrashed(true); return out_({ ok: true }); });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}


/* =====================================================================
   ✅ POSTER APPROVAL LINKS — the Principal approves or asks for changes
   ===================================================================== */
function approvals_(q) {
  try {
    const D = sub_(dataDir_(), 'approvals'), act = q.action;
    if (act === 'ap_put') {
      if (!UNIT_CODE) return out_({ ok: false, error: 'nocode' });
      if (q.code !== UNIT_CODE) return out_({ ok: false, error: 'code' });
      const id = 'a' + Date.now().toString(36), key = key_();
      const f = D.createFile(Utilities.newBlob(Utilities.base64Decode(String(q.img || '')), 'image/jpeg', id + '.jpg'));
      return withLock_(() => { const L = readJson_(D, 'approvals.json', {}); L[id] = { id: id, key: key, file: f.getId(), title: String(q.title || '').slice(0, 120), caption: String(q.caption || '').slice(0, 3000), by: String(q.by || '').slice(0, 40), at: Date.now(), status: 'waiting', notes: [] };
        const ids = Object.keys(L).sort((a, b) => L[b].at - L[a].at); ids.slice(200).forEach(k => { try { DriveApp.getFileById(L[k].file).setTrashed(true); } catch (e) {} delete L[k]; });
        writeJson_(D, 'approvals.json', L); return out_({ ok: true, id: id, key: key }); });
    }
    const L = readJson_(D, 'approvals.json', {}), a = L[String(q.id || '')];
    if (!a || (q.key !== a.key && !(UNIT_CODE && q.code === UNIT_CODE))) return out_({ ok: false, error: 'This link is not valid' });
    if (act === 'ap_get') { const o = Object.assign({}, a); delete o.key; if (q.img) { try { o.img = 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(a.file).getBlob().getBytes()); } catch (e) {} } return out_({ ok: true, item: o }); }
    if (act === 'ap_vote') return withLock_(() => { const L2 = readJson_(D, 'approvals.json', {}), b = L2[a.id];
      b.status = q.status === 'ok' ? 'approved' : 'changes'; b.notes.push({ by: String(q.by || '').slice(0, 40), status: b.status, text: String(q.text || '').slice(0, 1000), at: Date.now() });
      writeJson_(D, 'approvals.json', L2); return out_({ ok: true, status: b.status }); });
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}


/* =====================================================================
   🔔 DAILY REMINDERS — WhatsApp (CallMeBot, free), e-mail and a shared
   Google Calendar. Run  setupReminders  once from the editor (▶ Run).
   ===================================================================== */
function remDir_() { return sub_(dataDir_(), 'reminders'); }
function reminders_(q) {
  try {
    if (!UNIT_CODE) return out_({ ok: false, error: 'nocode' });
    if (q.code !== UNIT_CODE) return out_({ ok: false, error: 'code' });
    const D = remDir_();
    if (q.action === 'rem_save') { const cfg = { people: (q.people || []).slice(0, 40), items: (q.items || []).slice(0, 600), calendar: !!q.calendar, hour: Math.max(5, Math.min(21, +q.hour || 7)), saved: Date.now() };
      writeJson_(D, 'reminders.json', cfg); let cal = '';
      if (cfg.calendar) { try { cal = syncCalendar_(cfg); } catch (e) { cal = 'Calendar: ' + e.message; } }
      const trig = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyReminders');
      return out_({ ok: true, saved: cfg.saved, trigger: trig, calendar: cal }); }
    if (q.action === 'rem_get') { const cfg = readJson_(D, 'reminders.json', { people: [], items: [] }); return out_({ ok: true, config: cfg, log: readJson_(D, 'log.json', []), trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyReminders') }); }
    if (q.action === 'rem_test') { const r = sendReminders_(true); return out_({ ok: true, result: r }); }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function dailyReminders() { sendReminders_(false); }
function sendReminders_(test) {
  const D = remDir_(), cfg = readJson_(D, 'reminders.json', { people: [], items: [] });
  const day = d => Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd'), today = day(new Date()), tom = day(new Date(Date.now() + 864e5));
  const results = [];
  (cfg.people || []).forEach(p => {
    const mine = it => p.all || !it.who || String(it.who).toLowerCase().indexOf(String(p.name || '~').toLowerCase()) >= 0 || (p.role && String(it.who).toLowerCase().indexOf(String(p.role).toLowerCase()) >= 0);
    const now = (cfg.items || []).filter(it => it.date === today && mine(it)), next = (cfg.items || []).filter(it => it.date === tom && mine(it));
    if (!now.length && !next.length && !test) return;
    let msg = '🔔 Baduriya Media Unit — ' + Utilities.formatDate(new Date(), TIMEZONE, 'EEE d MMM') + '\n';
    if (test) msg += '(Test message — reminders are working ✓)\n';
    if (now.length) msg += '\nTODAY:\n' + now.map(it => '• ' + it.text).join('\n') + '\n';
    if (next.length) msg += '\nTOMORROW:\n' + next.map(it => '• ' + it.text).join('\n') + '\n';
    if (!now.length && !next.length) msg += '\nNothing due today or tomorrow.\n';
    msg += '\nOpen the portal: https://baduriyacc.github.io/BCMC/';
    const r = { name: p.name, wa: '', mail: '' };
    if (p.phone && p.key) { try { const res = UrlFetchApp.fetch('https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(String(p.phone).replace(/[^\d+]/g, '')) + '&text=' + encodeURIComponent(msg) + '&apikey=' + encodeURIComponent(p.key), { muteHttpExceptions: true }); r.wa = res.getResponseCode() === 200 ? 'sent' : 'error ' + res.getResponseCode(); } catch (e) { r.wa = 'error'; } Utilities.sleep(1500); }
    if (p.email) { try { MailApp.sendEmail(p.email, (test ? '[Test] ' : '') + 'Baduriya Media — ' + (now.length ? now.length + ' thing(s) today' : 'reminder'), msg); r.mail = 'sent'; } catch (e) { r.mail = 'error'; } }
    results.push(r);
  });
  const log = readJson_(D, 'log.json', []); log.unshift({ at: Date.now(), test: !!test, results: results }); writeJson_(D, 'log.json', log.slice(0, 40));
  return results;
}
function syncCalendar_(cfg) {
  const name = 'Baduriya Media Unit', cals = CalendarApp.getCalendarsByName(name), cal = cals.length ? cals[0] : CalendarApp.createCalendar(name, { color: CalendarApp.Color.RED });
  const from = new Date(Date.now() - 2 * 864e5), to = new Date(Date.now() + 120 * 864e5);
  cal.getEvents(from, to).forEach(ev => { if (ev.getTag('bmp') === '1') ev.deleteEvent(); });
  let n = 0; (cfg.items || []).forEach(it => { const d = new Date(it.date + 'T00:00:00'); if (d < from || d > to) return; const ev = cal.createAllDayEvent(it.text, d); ev.setTag('bmp', '1'); try { ev.addPopupReminder(60 * 17); } catch (e) {} n++; });
  return n + ' calendar events · calendar id: ' + cal.getId();
}
/** ▶ Run this ONCE from the Apps Script editor (choose it in the menu, press Run, allow). */
function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'dailyReminders') ScriptApp.deleteTrigger(t); });
  const cfg = readJson_(remDir_(), 'reminders.json', { hour: 7 });
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(cfg.hour || 7).inTimezone(TIMEZONE).create();
  Logger.log('Daily reminders are ON at ' + (cfg.hour || 7) + ':00 (' + TIMEZONE + ').');
}
