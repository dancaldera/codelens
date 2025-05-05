const { contextBridge, ipcRenderer } = require('electron');

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
  // Trigger screenshot manually from renderer
  captureScreenshot: () => ipcRenderer.send('request-screenshot'),
  // Receive screenshot image data
  onScreenshotImage: (callback) => ipcRenderer.on('screenshot-image', (e, imageData) => callback(imageData)),
  // Clear screenshots
  onClearScreenshots: (callback) => ipcRenderer.on('clear-screenshots', () => callback()),
  // Open screenshot in Preview
  openScreenshot: (index) => ipcRenderer.send('open-screenshot', index)
});

// Handle screenshot trigger from main process
ipcRenderer.on('trigger-screenshot', async () => {
  try {
    console.log('Screenshot capture triggered from main process');
    // Forward the request to the main process
    ipcRenderer.send('request-screenshot');
  } catch (err) {
    console.error('Error in trigger-screenshot handler:', err);
    ipcRenderer.send('screenshot-captured', null);
  }
});

// We'll move the screenshot capture to the main process since desktopCapturer
// is having issues in the renderer process