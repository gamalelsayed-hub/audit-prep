const {app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu} = require("electron");
const fs = require("fs");
const path = require("path");
const {pathToFileURL} = require("url");
const {Store, copyDir} = require("./storage");

protocol.registerSchemesAsPrivileged([{scheme:"aprep", privileges:{standard:true, secure:true, supportFetchAPI:true, stream:true}}]);

const configFile = () => path.join(app.getPath("userData"), "config.json");
const readConfig = () => { try{ return JSON.parse(fs.readFileSync(configFile(), "utf8")); }catch(e){ return {}; } };
const writeConfig = c => { fs.mkdirSync(path.dirname(configFile()), {recursive:true}); fs.writeFileSync(configFile(), JSON.stringify(c, null, 2)); };
const defaultDir = () => path.join(app.getPath("documents"), "AuditPrep");

let store, win;
function openStore(){ const c = readConfig(); store = new Store(c.dataDir || defaultDir()); }

function createWindow(){
  win = new BrowserWindow({
    width:1360, height:900, minWidth:900, minHeight:600, title:"ملف المراجعة المسبق", backgroundColor:"#f4f4f1",
    webPreferences:{preload:path.join(__dirname, "preload.js"), contextIsolation:true, sandbox:true, nodeIntegration:false}
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith("aprep://files/")){ try{ shell.openPath(store.filePath(decodeURIComponent(url.slice(14)))); }catch(e){} }
    else if (/^https?:/.test(url)) shell.openExternal(url);
    return {action:"deny"};
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")){ e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(() => {
  openStore();
  protocol.handle("aprep", req => {
    const u = new URL(req.url);
    if (u.host !== "files") return new Response("not found", {status:404});
    try{ return net.fetch(pathToFileURL(store.filePath(decodeURIComponent(u.pathname.slice(1)))).toString()); }
    catch(e){ return new Response("not found", {status:404}); }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:"ملف", submenu:[{role:"reload", label:"إعادة تحميل"}, {role:"toggleDevTools", label:"أدوات المطور"}, {type:"separator"}, {role:"quit", label:"خروج"}]},
    {label:"تحرير", submenu:[{role:"undo", label:"تراجع"}, {role:"redo", label:"إعادة"}, {type:"separator"}, {role:"cut", label:"قص"}, {role:"copy", label:"نسخ"}, {role:"paste", label:"لصق"}, {role:"selectAll", label:"تحديد الكل"}]},
    {label:"عرض", submenu:[{role:"zoomIn", label:"تكبير"}, {role:"zoomOut", label:"تصغير"}, {role:"resetZoom", label:"الحجم الأصلي"}, {role:"togglefullscreen", label:"ملء الشاشة"}]}
  ]));
  createWindow();
});
app.on("window-all-closed", () => app.quit());

ipcMain.handle("db:read", (e, p) => store.read(p));
ipcMain.handle("db:write", (e, p, data) => { store.write(p, data); return true; });
ipcMain.handle("db:remove", (e, p) => { store.remove(p); return true; });
ipcMain.handle("db:list", (e, c) => store.list(c));
ipcMain.handle("files:put", (e, name, bytes) => store.putFile(name, bytes));
ipcMain.handle("files:remove", (e, id) => { store.removeFile(id); return true; });
ipcMain.handle("files:usage", () => store.usage());
ipcMain.handle("dl:save", async (e, filename, bytes) => {
  const r = await dialog.showSaveDialog(win, {defaultPath:path.join(app.getPath("downloads"), filename)});
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, Buffer.from(bytes)); shell.showItemInFolder(r.filePath); return true;
});
ipcMain.handle("dir:get", () => store.dir);
ipcMain.handle("dir:open", () => shell.openPath(store.dir));
ipcMain.handle("dir:choose", async () => {
  const r = await dialog.showOpenDialog(win, {title:"اختر فولدر حفظ البيانات", properties:["openDirectory", "createDirectory"]});
  if (r.canceled || !r.filePaths[0]) return false;
  const to = path.join(r.filePaths[0], "AuditPrep");
  if (path.resolve(to) === path.resolve(store.dir)) return false;
  const hasData = fs.existsSync(path.join(to, "db")) && fs.readdirSync(path.join(to, "db")).length;
  if (!hasData){
    const a = await dialog.showMessageBox(win, {type:"question", buttons:["انقل بياناتي الحالية", "ابدأ فولدر فاضي", "إلغاء"], defaultId:0, cancelId:2,
      message:"تنقل البيانات والمرفقات الحالية للفولدر الجديد؟", detail:to});
    if (a.response === 2) return false;
    if (a.response === 0) copyDir(store.dir, to);
  }
  const c = readConfig(); c.dataDir = to; writeConfig(c); openStore(); return true;
});

// ---------- updates: compare with the latest GitHub release, download it, and start the installer ----------
const REPO = "gamalelsayed-hub/audit-prep";
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return false; };
let lastRelease = null;
ipcMain.handle("upd:check", async () => {
  const current = app.getVersion();
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {headers:{"User-Agent":"AuditPrep", "Accept":"application/vnd.github+json"}});
  if (!res.ok) throw new Error("GitHub " + res.status);
  const r = await res.json(), latest = String(r.tag_name || "").replace(/^v/, "");
  const want = isPortable() ? /Portable/i : /Setup/i;
  const asset = (r.assets || []).find(a => want.test(a.name) && /\.exe$/i.test(a.name));
  lastRelease = asset ? {name:asset.name, url:asset.browser_download_url, size:asset.size} : null;
  return {current, latest, newer:newer(latest, current) && !!asset, notes:r.body || "", published:r.published_at || "", page:r.html_url || "", portable:isPortable(), size:asset ? asset.size : 0};
});
ipcMain.handle("upd:download", async e => {
  if (!lastRelease) throw new Error("check first");
  const {name, url, size} = lastRelease;
  const res = await net.fetch(url, {headers:{"User-Agent":"AuditPrep"}});
  if (!res.ok || !res.body) throw new Error("download " + res.status);
  const total = Number(res.headers.get("content-length")) || size || 0;
  const dir = isPortable() ? process.env.PORTABLE_EXECUTABLE_DIR : path.join(app.getPath("temp"), "AuditPrep-update");
  fs.mkdirSync(dir, {recursive:true});
  const file = path.join(dir, name), part = file + ".part", out = fs.createWriteStream(part);
  const reader = res.body.getReader(); let got = 0, lastPct = -1;
  try{
    for (;;){
      const {done, value} = await reader.read(); if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise(r => out.once("drain", r));
      const pct = total ? Math.floor(got * 100 / total) : 0;
      if (pct !== lastPct){ lastPct = pct; e.sender.send("upd:progress", pct); }
    }
    await new Promise((ok, bad) => out.end(err => err ? bad(err) : ok()));
  }catch(err){ out.destroy(); try{ fs.unlinkSync(part); }catch(_){} throw err; }
  fs.renameSync(part, file);
  if (isPortable()){ shell.showItemInFolder(file); return {file, portable:true}; }
  // the installer replaces this version; data in the data folder is untouched
  const err = await shell.openPath(file);
  if (err) throw new Error(err);
  setTimeout(() => app.quit(), 1500);
  return {file, portable:false};
});
