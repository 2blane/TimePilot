// const { ipcRenderer } = require('electron');

const selectFileButton = document.getElementById('select-file');
const playButton = document.getElementById('play-button');
const stopButton = document.getElementById('stop-button');
const filePathElement = document.getElementById('file-path');
const audioPlayer = document.getElementById('audio-player');

const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
const framesInput = document.getElementById('frames');

const midiOutputSelect = document.getElementById('midi-output');
const audioOutputSelect = document.getElementById('audio-output');
const currentTimecodeElement = document.getElementById('current-timecode');

const artnetIpInput = document.getElementById('artnet-ip');
const artnetPortInput = document.getElementById('artnet-port');

let currentFilePath = null;
let frameRate = 30; // Assuming 30 FPS for frames
let animationFrameId = null; // For requestAnimationFrame
let timecodeOffsetInSeconds = 0; // Offset timecode from user input
let selectedMidiOutput = null;
let quarterFrameIntervalId = null;
let artnetSocket = null;

// When the app loads, read the settings and prefill the form
window.addEventListener('DOMContentLoaded', () => {
    // Get saved settings and populate form inputs
    let ipValue = window.settings.get('artnetIp') || '255.255.255.255';
    let portValue = window.settings.get('artnetPort') || 6454;
    frameRate = window.settings.get('frameRate') || 30;

    let hoursValue = window.settings.get('hours') || 0;
    let minutesValue = window.settings.get('minutes') || 0;
    let secondsValue = window.settings.get('seconds') || 0;
    let framesValue = window.settings.get('frames') || 0;
    
    console.log("DOM Content Loaded", ipValue, portValue, frameRate)
    document.getElementById('artnet-ip').value = ipValue;
    document.getElementById('artnet-port').value = portValue;
    //document.getElementById('frame-rate').value = frameRate;

    document.getElementById('hours').value = hoursValue;
    document.getElementById('minutes').value = minutesValue;
    document.getElementById('seconds').value = secondsValue;
    document.getElementById('frames').value = framesValue;
});

artnetIpInput.addEventListener('change', () => {
    const ip = artnetIpInput.value;
    window.settings.set('artnetIp', ip);
});
  
artnetPortInput.addEventListener('change', () => {
    const port = parseInt(artnetPortInput.value) || 6454;
    window.settings.set('artnetPort', port);
});

hoursInput.addEventListener('change', () => {
    const val = parseInt(hoursInput.value) || 0;
    window.settings.set('hours', val);
});
minutesInput.addEventListener('change', () => {
    const val = parseInt(minutesInput.value) || 0;
    window.settings.set('minutes', val);
});
secondsInput.addEventListener('change', () => {
    const val = parseInt(secondsInput.value) || 0;
    window.settings.set('seconds', val);
});
framesInput.addEventListener('change', () => {
    const val = parseInt(framesInput.value) || 0;
    window.settings.set('frames', val);
});

// Handle file selection
selectFileButton.addEventListener('click', async () => {
  try {
    const filePath = await window.ipcRenderer.invoke('select-mp3-file');
    if (filePath) {
      currentFilePath = filePath;
      filePathElement.textContent = `Selected File: ${filePath}`;
      audioPlayer.src = `file://${filePath}`; // Set audio player source to file path
      playButton.disabled = false; // Enable the play button
    } else {
      filePathElement.textContent = 'No file selected';
      playButton.disabled = true;
    }
  } catch (error) {
    console.error('Error selecting file:', error);
  }
});

// Handle play button click
playButton.addEventListener('click', () => {
  if (!currentFilePath) return;

  // Get the timecode from the inputs
  const hours = parseInt(hoursInput.value) || 0;
  const minutes = parseInt(minutesInput.value) || 0;
  const seconds = parseInt(secondsInput.value) || 0;
  const frames = parseInt(framesInput.value) || 0;

  // Convert to total seconds (ignoring frames for the MP3 player)
  // Calculate offset time in seconds
  timecodeOffsetInSeconds = (hours * 3600) + (minutes * 60) + seconds + (frames / frameRate);
  console.log(`Starting playback with offset: ${hours}:${minutes}:${seconds}:${frames} (${timecodeOffsetInSeconds} seconds)`);

  // Send the full timecode message before playing
  sendFullMidiTimecode(hours, minutes, seconds, frames);

  //reset the current time to the start.
  audioPlayer.currentTime = 0;
  audioPlayer.play();

  // Start the timecode display sync
  startQuarterFrameSync();
  // Enable the Stop button
  stopButton.disabled = false;
});

// Handle stop button click
stopButton.addEventListener('click', () => {
  stopPlayback();
});

// Stop playback and clear quarter frame sync
function stopPlayback() {
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    clearInterval(quarterFrameIntervalId);
    updateTimecodeDisplay(0, 0, 0, 0);
    stopButton.disabled = true;
}

function setupArtNetSocket() {
    if (artnetSocket) {
        try {
            artnetSocket.close();
        } catch (err) {
            console.error('Error closing the previous ArtNet socket:', err);
        }
    }
    
    artnetSocket = window.udp.createSocket();
    artnetSocket.on('error', (err) => {
        console.error('ArtNet Socket Error:', err);
    });
    artnetSocket.on('close', (err) => {
        console.log('ArtNet Socket Closed:', err);
    });
}

// Sends timecode to the artnet socket.
function sendArtNetTimecode(hours, minutes, seconds, frames) {
    const ip = artnetIpInput.value;
    const port = parseInt(artnetPortInput.value) || 6454;
    
    const fpsCode = (frameRate === 24) ? 0 :
                    (frameRate === 25) ? 1 :
                    (frameRate === 29.97) ? 2 :
                    (frameRate === 30) ? 3 : 3;
  
    const packet = window.Buffer.from([
      0x41, 0x72, 0x74, 0x2D, 0x4E, 0x65, 0x74, 0x00, // "Art-Net\0"
      0x97, 0x00, // Opcode (ArtTimecode)
      0x00, 0x0E, // Protocol Version (14)
      0x00, 0x00, // Reserved
      fpsCode,    // FPS (0=24, 1=25, 2=29.97, 3=30)
      hours,      // Hours
      minutes,    // Minutes
      seconds,    // Seconds
      frames      // Frames
    ]);
    
    if (!artnetSocket) {
        console.log("No Artnet Socket Setup", artnetSocket)
        return
    }
    // console.log("artnet socket", artnetSocket)
    try {
        artnetSocket.send(packet, port, ip, (err) => {
            if (err) console.error('ArtNet send error:', err);
        });
    } catch (err) {
        console.error("ArtnetSocket Error", err)
    }
}

// Start sending quarter frame MIDI sync
function startQuarterFrameSync() {
    setupArtNetSocket();
    clearInterval(quarterFrameIntervalId);
    quarterFrameIntervalId = setInterval(() => {
      const currentTime = audioPlayer.currentTime + timecodeOffsetInSeconds;
      const totalFrames = Math.floor(currentTime * frameRate);
      const frameNumber = totalFrames % frameRate;
        
      // Calculate the 8 quarter frame nibbles and send over MIDI
      for (let nibbleIndex = 0; nibbleIndex < 8; nibbleIndex++) {
        sendQuarterFrame(currentTime, nibbleIndex);
      }

      // Now send the art net timecode
      const totalSeconds = Math.floor(currentTime);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
  
      sendArtNetTimecode(hours, minutes, seconds, frameNumber);
    }, 1000 / frameRate);
}

// Send one quarter frame message
function sendQuarterFrame(currentTime, nibbleIndex) {
  
    const totalFrames = Math.floor(currentTime * frameRate);
    const frame = totalFrames % frameRate;
    const totalSeconds = Math.floor(currentTime);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
  
    let nibbleValue;
  
    switch (nibbleIndex) {
      case 0: nibbleValue = frame & 0x0F; break; // Frames low nibble
      case 1: nibbleValue = (frame >> 4) & 0x03; break; // Frames high nibble
      case 2: nibbleValue = seconds & 0x0F; break; // Seconds low nibble
      case 3: nibbleValue = (seconds >> 4) & 0x07; break; // Seconds high nibble
      case 4: nibbleValue = minutes & 0x0F; break; // Minutes low nibble
      case 5: nibbleValue = (minutes >> 4) & 0x07; break; // Minutes high nibble
      case 6: nibbleValue = hours & 0x0F; break; // Hours low nibble
      case 7: nibbleValue = ((frameRate === 30 ? 3 : 0) << 1) | ((hours >> 4) & 0x01); break; // Hours high nibble + FPS
    }
  
    const message = [0xF1, (nibbleIndex << 4) | (nibbleValue & 0x0F)];
    if (selectedMidiOutput) {
        selectedMidiOutput.send(message);
    }
    updateTimecodeDisplay(hours, minutes, seconds, frame);
}

// **New Method** - Send Full MIDI Timecode (Sync Start)
function sendFullMidiTimecode(hours, minutes, seconds, frames) {
    if (!selectedMidiOutput) return;
    
    const fpsNibble = (frameRate === 24) ? 0 :
                      (frameRate === 25) ? 1 :
                      (frameRate === 29.97) ? 2 :
                      (frameRate === 30) ? 3 : 3;
  
    // Construct HH byte (4 bits for FPS, 4 bits for Hours)
    const hhByte = ((fpsNibble & 0b11) << 5) | (hours & 0b11111);
    
    const message = [
      0xF0, 0x7F, 0x7F, 0x01, 0x01, // SysEx Header
      hhByte,  // HH (4 bits FPS + 4 bits Hours)
      minutes, // MM (Minutes)
      seconds, // SS (Seconds)
      frames,  // FF (Frames)
      0xF7     // End of SysEx
    ];
  
    console.log('Sending Full Timecode:', message.map(byte => byte.toString(16).padStart(2, '0')).join(' '));
    selectedMidiOutput.send(message);
}

// Update the timecode display
function updateTimecodeDisplay(hours, minutes, seconds, frames) {
    const formattedTimecode = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
    currentTimecodeElement.textContent = formattedTimecode;
}

// Utility function to pad numbers with leading zeros
function pad(number) {
  return number.toString().padStart(2, '0');
}

// List available audio output devices and automatically select the default
async function listAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(device => device.kind === 'audiooutput');
    
    audioOutputSelect.innerHTML = '';
    let defaultDeviceId = null;
  
    audioDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Device ${index + 1}`;
      audioOutputSelect.appendChild(option);
  
      // Check if this is the default device
      if (device.deviceId === 'default') {
        defaultDeviceId = device.deviceId;
        option.selected = true; // Automatically select it in the dropdown
      }
    });
  
    // Set default audio output on the audio player
    if (defaultDeviceId && typeof audioPlayer.setSinkId === 'function') {
      try {
        await audioPlayer.setSinkId(defaultDeviceId);
        console.log(`Audio output set to default device: ${defaultDeviceId}`);
      } catch (error) {
        console.error('Error setting default audio output:', error);
      }
    }
  }

// Change the audio output device
audioOutputSelect.addEventListener('change', async (event) => {
    const deviceId = event.target.value;

    if (typeof audioPlayer.setSinkId === 'function') {
        try {
        await audioPlayer.setSinkId(deviceId);
        console.log(`Audio output changed to deviceId: ${deviceId}`);
        } catch (error) {
        console.error('Error setting audio output:', error);
        }
    } else {
        console.warn('Audio output selection is not supported on this browser or version of Electron.');
    }
});

// List available MIDI outputs
async function listMidiOutputs() {
    const midiAccess = await navigator.requestMIDIAccess({sysex: true});
    const outputs = Array.from(midiAccess.outputs.values());
    midiOutputSelect.innerHTML = '';
    
    outputs.forEach((output, index) => {
      const option = document.createElement('option');
      option.value = output.id;
      option.textContent = output.name || `MIDI Device ${index + 1}`;
      midiOutputSelect.appendChild(option);
    });
  }
  
// Handle MIDI output selection
midiOutputSelect.addEventListener('change', () => {
    const selectedId = midiOutputSelect.value;
    const midiAccess = navigator.requestMIDIAccess({sysex: true});
    midiAccess.then(access => {
      selectedMidiOutput = access.outputs.get(selectedId);
      console.log(`Selected MIDI Output: ${selectedMidiOutput.name}`);
    });
});

// Call listAudioDevices when the app loads
listAudioDevices();
// Call listMidiOutputs when the app loads
listMidiOutputs();