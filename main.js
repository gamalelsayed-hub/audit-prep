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
