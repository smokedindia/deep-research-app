const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startResearch: (data) => ipcRenderer.send('start-research', data),
    stopResearch: () => ipcRenderer.send('stop-research'),
    exportReport: (content) => ipcRenderer.send('export-report', content),

    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, data) => callback(data)),
    onActivityLog: (callback) => ipcRenderer.on('activity-log', (event, data) => callback(data)),
    onResearchComplete: (callback) => ipcRenderer.on('research-complete', (event, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('error', (event, data) => callback(data))
});
