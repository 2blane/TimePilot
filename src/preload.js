// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron');
const dgram = require('dgram');

// Expose dgram (for ArtNet support) to the renderer process
contextBridge.exposeInMainWorld('udp', {
    createSocket: () => {
      const socket = dgram.createSocket('udp4');
      return {
        send: (msg, port, address, callback) => socket.send(msg, port, address, callback),
        close: () => socket.close(),
        on: (event, callback) => socket.on(event, callback),
        bind: (port, address) => socket.bind(port, address)
      };
    }
});

// Expose the full ipcRenderer to the renderer process
contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (...args) => ipcRenderer.send(...args),
    invoke: (...args) => ipcRenderer.invoke(...args),
    on: (...args) => ipcRenderer.on(...args),
    once: (...args) => ipcRenderer.once(...args)
});

// Expose Buffer to the renderer process
contextBridge.exposeInMainWorld('Buffer', {
    from: (...args) => Buffer.from(...args)
});