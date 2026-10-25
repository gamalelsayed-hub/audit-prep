const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("aprepNative", {
  read:p => ipcRenderer.invoke("db:read", p),
  write:(p, data) => ipcRenderer.invoke("db:write", p, data),
  remove:p => ipcRenderer.invoke("db:remove", p),
  list:c => ipcRenderer.invoke("db:list", c),
  putFile:(name, bytes) => ipcRenderer.invoke("files:put", name, bytes),
  removeFile:id => ipcRenderer.invoke("files:remove", id),
  usage:() => ipcRenderer.invoke("files:usage"),
  saveFile:(filename, bytes) => ipcRenderer.invoke("dl:save", filename, bytes),
  getDir:() => ipcRenderer.invoke("dir:get"),
  openDir:() => ipcRenderer.invoke("dir:open"),
  chooseDir:() => ipcRenderer.invoke("dir:choose"),
});
