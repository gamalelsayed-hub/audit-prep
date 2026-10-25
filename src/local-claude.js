// Desktop runtime: gives the page the same window.claude.use("db" | "assets" | "downloads") API it has online,
// backed by files in the data folder (see storage.js).
(function(){
  const N = window.aprepNative;
  if (!N) return;
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const docL = new Map(), colL = new Map();
  const on = (m, k, f) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(f); return () => m.get(k).delete(f); };
  const parentOf = p => p.split("/").slice(0, -1).join("/");
  const snap = async p => { const d = await N.read(p); return {id:p.split("/").pop(), exists:d != null, data:() => clone(d)}; };
  const qsnap = async c => { const list = await N.list(c); return {docs:list.map(x => ({id:x.id, data:() => clone(x.data)}))}; };
  async function notify(p){
    for (const f of (docL.get(p) || [])) snap(p).then(f).catch(() => {});
    const c = parentOf(p);
    for (const f of (colL.get(c) || [])) qsnap(c).then(f).catch(() => {});
  }
  const db = {
    doc(p){ return {
      get:() => snap(p),
      set:async data => { await N.write(p, clone(data)); notify(p); },
      delete:async () => { await N.remove(p); notify(p); },
      onSnapshot(f, err){ snap(p).then(f).catch(e => err && err(e)); return on(docL, p, f); }
    }; },
    collection(c){ return {
      onSnapshot(f, err){ qsnap(c).then(f).catch(e => err && err(e)); return on(colL, c, f); }
    }; }
  };
  const assets = {
    raw:true,
    async upload(blob){ const id = await N.putFile(blob.name || "file", new Uint8Array(await blob.arrayBuffer())); return {id, url:"aprep://files/" + encodeURIComponent(id)}; },
    async delete(id){ await N.removeFile(id); },
    async list(){ return {usage:await N.usage()}; }
  };
  const downloads = {
    async save({filename, data}){
      const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(String(data));
      const ok = await N.saveFile(filename, bytes);
      if (!ok){ const e = new Error("declined"); e.code = "declined"; throw e; }
    }
  };
  const caps = {db, assets, downloads};
  window.claude = {use:async n => { if (caps[n]) return caps[n]; throw new Error("unavailable"); },
    local:{getDir:N.getDir, openDir:N.openDir, chooseDir:N.chooseDir}};
})();
