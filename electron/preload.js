const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    version: process.env.npm_package_version,
    openFileUrl: (url, filename) => ipcRenderer.invoke('open-file-url', url, filename),
});
