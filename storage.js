// Local storage behind the page's db / assets API: one JSON file per document, one file per attachment.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const seg = s => encodeURIComponent(String(s)).replace(/\./g, "%2E");
const unseg = s => decodeURIComponent(s);

class Store {
  constructor(dir){ this.dir = dir; fs.mkdirSync(path.join(dir, "db"), {recursive:true}); fs.mkdirSync(path.join(dir, "files"), {recursive:true}); }
  docFile(p){
    const parts = String(p).split("/").filter(Boolean);
    if (parts.length < 2 || parts.length % 2) throw new Error("bad document path: " + p);
    return path.join(this.dir, "db", ...parts.slice(0, -1).map(seg), seg(parts[parts.length-1]) + ".json");
  }
  colDir(c){
    const parts = String(c).split("/").filter(Boolean);
    if (!parts.length || parts.length % 2 === 0) throw new Error("bad collection path: " + c);
    return path.join(this.dir, "db", ...parts.map(seg));
  }
  read(p){ try{ return JSON.parse(fs.readFileSync(this.docFile(p), "utf8")); }catch(e){ return null; } }
  write(p, data){
    const f = this.docFile(p); fs.mkdirSync(path.dirname(f), {recursive:true});
    const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, f);
  }
  remove(p){ try{ fs.unlinkSync(this.docFile(p)); }catch(e){} }
  list(c){
    let names = [];
    try{ names = fs.readdirSync(this.colDir(c)).filter(n => n.endsWith(".json")); }catch(e){ return []; }
    return names.map(n => { const id = unseg(n.slice(0, -5)); return {id, data:this.read(c + "/" + id)}; }).filter(d => d.data != null);
  }
  putFile(name, bytes){
    const ext = (String(name||"").match(/\.([A-Za-z0-9]{1,8})$/) || [,"bin"])[1].toLowerCase();
    const id = crypto.randomBytes(12).toString("hex") + "." + ext;
    fs.writeFileSync(path.join(this.dir, "files", id), Buffer.from(bytes));
    return id;
  }
  filePath(id){
    if (!/^[a-f0-9]{24}\.[a-z0-9]{1,8}$/.test(id)) throw new Error("bad file id");
    return path.join(this.dir, "files", id);
  }
  removeFile(id){ try{ fs.unlinkSync(this.filePath(id)); }catch(e){} }
  usage(){
    let files = 0, bytes = 0;
    for (const n of fs.readdirSync(path.join(this.dir, "files"))){ files++; bytes += fs.statSync(path.join(this.dir, "files", n)).size; }
    return {files, bytes, maxBytes:0};
  }
}
function copyDir(from, to){
  fs.mkdirSync(to, {recursive:true});
  for (const e of fs.readdirSync(from, {withFileTypes:true})){
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
module.exports = {Store, copyDir};
