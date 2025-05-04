const { contextBridge, ipcRenderer, desktopCapturer, screen } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// Expose API to renderer
contextBridge.exposeInMainWorld('api', {
  // Submit prompt text from renderer
  submitPrompt: (prompt) => ipcRenderer.send('submit-prompt', prompt),
  // Screenshot status updates
  onScreenshotStatus: (callback) => ipcRenderer.on('screenshot-status', (e, status) => callback(status)),
  // Analysis result from main
  onAnalysisResult: (callback) => ipcRenderer.on('analysis-result', (e, result) => callback(result)),
  // Context reset notification
  onContextReset: (callback) => ipcRenderer.on('context-reset', () => callback()),
  // Submit result notification
  onSubmitResult: (callback) => ipcRenderer.on('submit-result', (e, result) => callback(result)),
});

// Handle screenshot trigger from main process
ipcRenderer.on('trigger-screenshot', async () => {
  try {
    // Get screen size for full-resolution capture
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    // Use first screen source
    const screenSource = sources[0];
    const imageBuffer = screenSource.thumbnail.toPNG();
    ipcRenderer.send('screenshot-captured', imageBuffer.toString('base64'));
  } catch (err) {
    console.error('Error capturing screenshot:', err);
    ipcRenderer.send('screenshot-captured', null);
  }
});