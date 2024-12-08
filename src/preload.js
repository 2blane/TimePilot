// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron');
const dgram = require('dgram');
const Store = require('simple-json-store');

// Path to where the settings are saved
const store = new Store('./config.json', { artnetIp: '255.255.255.255', artnetPort: 6454, frameRate: 30 });

// Expose the store to the renderer process
contextBridge.exposeInMainWorld('settings', {
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  delete: (key) => store.delete(key),
});

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