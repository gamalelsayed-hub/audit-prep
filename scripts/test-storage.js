// Exercises the desktop runtime (src/local-claude.js) against storage.js without Electron.
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const {Store} = require("../storage");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aprep-"));
const store = new Store(dir);
global.window = {aprepNative:{
  read:async p => store.read(p), write:async (p, d) => store.write(p, d), remove:async p => store.remove(p), list:async c => store.list(c),
  putFile:async (n, b) => store.putFile(n, b), removeFile:async id => store.removeFile(id), usage:async () => store.usage(),
  saveFile:async () => true, getDir:async () => dir, openDir:async () => {}, chooseDir:async () => false }};
require("../src/local-claude.js");
(async () => {
  const db = await window.claude.use("db"), assets = await window.claude.use("assets");
  const seen = [];
  db.collection("requests").onSnapshot(q => seen.push(q.docs.map(d => d.id).sort().join(",")));
  await db.doc("requests/r01").set({title:"ميزان المراجعة", files:[]});
  await db.doc("requests/r02").set({title:"كشف البنك"});
  await db.doc("fa/1210101~1").set({notes:"x"});
  assert.strictEqual((await db.doc("requests/r01").get()).data().title, "ميزان المراجعة");
  assert.strictEqual((await db.doc("fa/1210101~1").get()).exists, true);
  await db.doc("requests/r02").delete();
  assert.strictEqual((await db.doc("requests/r02").get()).exists, false);
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(seen[seen.length-1], "r01");
  const blob = {name:"فاتورة.pdf", arrayBuffer:async () => new TextEncoder().encode("%PDF-1.4 test").buffer};
  const up = await assets.upload(blob);
  assert.ok(/^[a-f0-9]{24}\.pdf$/.test(up.id));
  assert.strictEqual(fs.readFileSync(store.filePath(up.id), "utf8"), "%PDF-1.4 test");
  assert.strictEqual((await assets.list()).usage.files, 1);
  await assets.delete(up.id);
  assert.strictEqual((await assets.list()).usage.files, 0);
  assert.throws(() => store.filePath("../../etc/passwd"));
  assert.throws(() => store.docFile("only-one-segment"));
  console.log("storage tests passed");
})().catch(e => { console.error(e); process.exit(1); });
