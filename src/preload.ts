import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';

// Type definitions for exposed API
interface ApiInterface {
	submitPrompt: (prompt: string) => void;
	onScreenshotStatus: (callback: (status: string) => void) => void;
	onAnalysisResult: (callback: (result: string) => void) => void;
	onContextReset: (callback: () => void) => void;
	onSubmitResult: (callback: (result: string) => void) => void;
	captureScreenshot: () => void;
	onScreenshotImage: (callback: (imageData: ScreenshotImageData) => void) => void;
	onClearScreenshots: (callback: () => void) => void;
	openScreenshot: (index: number) => void;
	onGetPrompt: (callback: () => string) => void;
	onShowLoading: (callback: () => void) => void;
	onChangeFontSize: (callback: (direction: string) => void) => void;
	saveApiKey: (apiKey: string) => void;
	getApiKey: () => Promise<string>;
	onLanguageDetected: (callback: (language: string) => void) => void;
}

interface ScreenshotImageData {
	index: number;
	data: string;
	path: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// Expose API to renderer
contextBridge.exposeInMainWorld('api', {
	// Submit prompt text from renderer
	submitPrompt: (prompt: string) => ipcRenderer.send('submit-prompt', prompt),
	// Screenshot status updates
	onScreenshotStatus: (callback: (status: string) => void) =>
		ipcRenderer.on('screenshot-status', (e: IpcRendererEvent, status: string) => callback(status)),
	// Analysis result from main
	onAnalysisResult: (callback: (result: string) => void) =>
		ipcRenderer.on('analysis-result', (e: IpcRendererEvent, result: string) => callback(result)),
	// Context reset notification
	onContextReset: (callback: () => void) => ipcRenderer.on('context-reset', () => callback()),
	// Submit result notification
	onSubmitResult: (callback: (result: string) => void) =>
		ipcRenderer.on('submit-result', (e: IpcRendererEvent, result: string) => callback(result)),
	// Trigger screenshot manually from renderer
	captureScreenshot: () => ipcRenderer.send('request-screenshot'),
	// Receive screenshot image data
	onScreenshotImage: (callback: (imageData: ScreenshotImageData) => void) =>
		ipcRenderer.on('screenshot-image', (e: IpcRendererEvent, imageData: ScreenshotImageData) => callback(imageData)),
	// Clear screenshots
	onClearScreenshots: (callback: () => void) => ipcRenderer.on('clear-screenshots', () => callback()),
	// Open screenshot in Preview
	openScreenshot: (index: number) => ipcRenderer.send('open-screenshot', index),
	// Get prompt from renderer
	onGetPrompt: (callback: () => string) =>
		ipcRenderer.on('get-prompt', (e: IpcRendererEvent) => {
			const promptText = callback();
			ipcRenderer.send('prompt-response', promptText);
		}),
	// Show loading indicator
	onShowLoading: (callback: () => void) => ipcRenderer.on('show-loading', () => callback()),
	// Font size change handler
	onChangeFontSize: (callback: (direction: string) => void) =>
		ipcRenderer.on('change-font-size', (e: IpcRendererEvent, direction: string) => callback(direction)),
	// API Key functions
	saveApiKey: (apiKey: string) => ipcRenderer.send('save-api-key', apiKey),
	getApiKey: () => ipcRenderer.invoke('get-api-key'),
	// Language detection
	onLanguageDetected: (callback: (language: string) => void) =>
		ipcRenderer.on('language-detected', (e: IpcRendererEvent, language: string) => callback(language)),
} as ApiInterface);

// Handle screenshot trigger from main process
ipcRenderer.on('trigger-screenshot', async () => {
	try {
		// Note: Basic console logging in preload, full winston logging in main process
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

// Add global type definitions for the API in window
declare global {
	interface Window {
		api: ApiInterface;
	}
}

// Preemptively suppress DevTools protocol errors by defining stub handler
// This code runs before context bridge is fully set up
if (typeof window !== 'undefined') {
	try {
		// Create a more robust stub for Autofill
		Object.defineProperty(window, 'Autofill', {
			value: {
				enable: () => Promise.resolve({}),
				setAddresses: () => Promise.resolve({}),
				// Add any other Autofill methods that might be called
				getAddresses: () => Promise.resolve([]),
				getAutofillableFields: () => Promise.resolve([]),
				setAutofillableFields: () => Promise.resolve({}),
			},
			writable: false,
			configurable: false,
		});

		console.log('Autofill protocol stubs installed successfully');
	} catch (error) {
		console.warn('Failed to install Autofill protocol stubs:', error);
	}
}

// Add error event listener to catch and log any uncaught errors
// This may help identify DevTools protocol errors in the renderer
window.addEventListener('error', (event) => {
	const errorMessage = event.message || 'Unknown error';
	const errorSource = event.filename || 'Unknown source';
	const lineNumber = event.lineno || 'Unknown line';
	const colNumber = event.colno || 'Unknown column';

	console.error(`Renderer error: ${errorMessage} at ${errorSource}:${lineNumber}:${colNumber}`);

	// Check if this is a DevTools Protocol error
	if (
		errorMessage.includes('Autofill') ||
		errorMessage.includes('DevTools') ||
		errorMessage.includes('protocol') ||
		(errorSource && errorSource.includes('devtools://')) ||
		(errorMessage && errorMessage.includes("wasn't found"))
	) {
		console.warn('DevTools Protocol error detected. This can be safely ignored.');
		// Prevent the error from being propagated further
		event.preventDefault();
		return true; // Suppress error
	}
});

// Add specific handler for console errors (handles Chrome DevTools errors)
const originalConsoleError = console.error;
console.error = (...args) => {
	// Check if this is an Autofill protocol error or other DevTools protocol error
	if (
		args.length > 0 &&
		typeof args[0] === 'string' &&
		(args[0].includes('Autofill') ||
			args[0].includes("wasn't found") ||
			args[0].includes('DevTools Protocol') ||
			args[0].includes('protocol_client.js'))
	) {
		// Silently ignore these specific DevTools protocol errors
		return;
	}

	// Call the original console.error with the arguments
	originalConsoleError.apply(console, args);
};
