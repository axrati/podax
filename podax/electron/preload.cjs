'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const podaxApi = Object.freeze({
  chooseFile: () => ipcRenderer.invoke('dialog:choose-file'),
  chooseFolder: () => ipcRenderer.invoke('dialog:choose-folder'),
  chooseEncryptedFile: () => ipcRenderer.invoke('dialog:choose-encrypted-file'),
  validatePath: (sourcePath) => ipcRenderer.invoke('path:validate', sourcePath),
  encrypt: (request) => ipcRenderer.invoke('crypto:encrypt', request),
  decrypt: (request) => ipcRenderer.invoke('crypto:decrypt', request),
});

contextBridge.exposeInMainWorld('podax', podaxApi);
