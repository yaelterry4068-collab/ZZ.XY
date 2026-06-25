const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardTool', {
  listHistory: () => ipcRenderer.invoke('history:list'),
  copyHistoryItem: (id) => ipcRenderer.invoke('history:copy', id),
  deleteHistoryItem: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  openImageViewer: (id) => ipcRenderer.invoke('image-viewer:open', id),
  moveImageViewer: (offset) => ipcRenderer.invoke('image-viewer:move', offset),
  copyImageViewer: () => ipcRenderer.invoke('image-viewer:copy'),
  closeImageViewer: () => ipcRenderer.invoke('image-viewer:close'),
  hideWindow: () => ipcRenderer.invoke('app:hide'),
  getStatus: () => ipcRenderer.invoke('app:status'),
  updateSettings: (settings) => ipcRenderer.invoke('app:update-settings', settings),
  dismissFirstLaunch: () => ipcRenderer.invoke('app:dismiss-first-launch'),
  onHistoryUpdated: (callback) => {
    ipcRenderer.on('history:updated', (_event, history) => callback(history));
  },
  onFocusSearch: (callback) => {
    ipcRenderer.on('app:focus-search', callback);
  },
  onImageViewerData: (callback) => {
    ipcRenderer.on('image-viewer:data', (_event, payload) => callback(payload));
  }
});
