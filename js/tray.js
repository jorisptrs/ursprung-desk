// The tray: persistent staging for the hand door (D84). Possession is identity —
// a token minted on first use keys the tray; no accounts, no passwords. Staging
// is private; laying on the table is the one consent, and the sheet performs it
// by calling commit with a sink. The backend is the castle seam: v0 keeps the
// token in localStorage and entries (blobs included) in IndexedDB; the LAN
// store later implements the same five calls over http, and nothing else moves.
//
// backend: {
//   loadToken() → t|null, saveToken(t),
//   loadEntries() → entries in staging order, saveEntry(entry) (upsert by id),
//   deleteEntry(id)
// } — all may be async.
//
// entry: { id, seq, artifact, blobs } — artifact is bare (no stream id/night;
// the receiving table allocates, D19) and JSON-clean; original files ride in
// blobs untouched, keyed by the slot they fill at materialize time.

export function createTray(backend) {
  return {
    async token() {
      let t = await backend.loadToken();
      if (!t) {
        t = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}`;
        await backend.saveToken(t);
      }
      return t;
    },

    async list() {
      const entries = (await backend.loadEntries()) ?? [];
      return entries.slice().sort((a, b) => a.seq - b.seq);
    },

    async stage(entry) {
      const entries = await this.list();
      const seq = entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
      // the whole entry rides — artifact, blobs, and whatever the sheet keeps
      // for faithful re-editing; dropping fields here loses staged work
      const stored = { blobs: {}, ...entry, id: `s-${seq}`, seq };
      await backend.saveEntry(stored);
      return stored.id;
    },

    async update(id, patch) {
      const entry = (await this.list()).find((e) => e.id === id);
      if (!entry) return;
      await backend.saveEntry({ ...entry, ...patch });
    },

    async unstage(id) {
      await backend.deleteEntry(id);
    },

    // The whole deck at once (D101), in staging order. A sink that throws keeps
    // its entry staged — rejected, never coerced; the reasons come back for one
    // dry line. `refuse(entry)` is the door's own rule: a reason string holds
    // that card back untouched, null lets it through.
    async commit(sink, refuse = () => null) {
      const laid = [];
      const rejected = [];
      for (const entry of await this.list()) {
        const held = refuse(entry);
        if (held) {
          rejected.push({ id: entry.id, title: entry.artifact.title, reason: held });
          continue;
        }
        try {
          await sink.deposit(entry.artifact, entry.blobs ?? {});
          await backend.deleteEntry(entry.id);
          laid.push(entry);
        } catch (err) {
          rejected.push({ id: entry.id, title: entry.artifact.title, reason: String(err?.message ?? err) });
        }
      }
      return { laid, rejected };
    },
  };
}

// ---- v0 browser backend: localStorage token, IndexedDB entries ----

const DB = 'desk-tray';
const STORE = 'entries';

function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

export function createBrowserBackend() {
  return {
    loadToken: () => localStorage.getItem('desk-tray-token'),
    saveToken: (t) => localStorage.setItem('desk-tray-token', t),
    loadEntries: () => withStore('readonly', (s) => s.getAll()),
    saveEntry: (entry) => withStore('readwrite', (s) => s.put(entry)),
    deleteEntry: (id) => withStore('readwrite', (s) => s.delete(id)),
  };
}
