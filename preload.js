// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveBoards: (boards) => ipcRenderer.invoke('sqlite-save-boards', boards),
    loadBoards: () => ipcRenderer.invoke('sqlite-load-boards'),
    mkdirSync: (dir) => ipcRenderer.invoke('mkdir-sync', dir)
});