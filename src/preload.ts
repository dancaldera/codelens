import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import {
	IPC_CHANNELS,
	isValidResizeWindowPayload,
	isValidScreenshotIndex,
	type ModelChangedPayload,
	type ScreenshotImagePayload,
} from './ipc'

type Unsubscribe = () => void

interface ApiInterface {
	submitPrompt: (prompt: string) => void
	onScreenshotStatus: (callback: (status: string) => void) => Unsubscribe
	onAnalysisResult: (callback: (result: string) => void) => Unsubscribe
	onContextReset: (callback: () => void) => Unsubscribe
	onSubmitResult: (callback: (result: string) => void) => Unsubscribe
	captureScreenshot: () => void
	onScreenshotImage: (callback: (imageData: ScreenshotImagePayload) => void) => Unsubscribe
	onClearScreenshots: (callback: () => void) => Unsubscribe
	openScreenshot: (index: number) => void
	onGetPrompt: (callback: () => string) => Unsubscribe
	onShowLoading: (callback: () => void) => Unsubscribe
	onLanguageDetected: (callback: (language: string) => void) => Unsubscribe
	onModelChanged: (callback: (model: string | ModelChangedPayload) => void) => Unsubscribe
	onModelsLoading: (callback: () => void) => Unsubscribe
	resizeWindow: (width: number, height: number) => void
}

function onIpc<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
	const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
	ipcRenderer.on(channel, listener)
	return () => ipcRenderer.removeListener(channel, listener)
}

function onIpcSignal(channel: string, callback: () => void): Unsubscribe {
	const listener = () => callback()
	ipcRenderer.on(channel, listener)
	return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
	submitPrompt: (prompt: string) => ipcRenderer.send(IPC_CHANNELS.SUBMIT_PROMPT, prompt),
	onScreenshotStatus: (callback: (status: string) => void) => onIpc(IPC_CHANNELS.SCREENSHOT_STATUS, callback),
	onAnalysisResult: (callback: (result: string) => void) => onIpc(IPC_CHANNELS.ANALYSIS_RESULT, callback),
	onContextReset: (callback: () => void) => onIpcSignal(IPC_CHANNELS.CONTEXT_RESET, callback),
	onSubmitResult: (callback: (result: string) => void) => onIpc(IPC_CHANNELS.SUBMIT_RESULT, callback),
	captureScreenshot: () => ipcRenderer.send(IPC_CHANNELS.REQUEST_SCREENSHOT),
	onScreenshotImage: (callback: (imageData: ScreenshotImagePayload) => void) =>
		onIpc(IPC_CHANNELS.SCREENSHOT_IMAGE, callback),
	onClearScreenshots: (callback: () => void) => onIpcSignal(IPC_CHANNELS.CLEAR_SCREENSHOTS, callback),
	openScreenshot: (index: number) => {
		if (!isValidScreenshotIndex(index)) {
			console.warn('Rejected invalid screenshot index', index)
			return
		}
		ipcRenderer.send(IPC_CHANNELS.OPEN_SCREENSHOT, index)
	},
	onGetPrompt: (callback: () => string) => {
		const listener = () => {
			ipcRenderer.send(IPC_CHANNELS.PROMPT_RESPONSE, callback())
		}
		ipcRenderer.on(IPC_CHANNELS.GET_PROMPT, listener)
		return () => ipcRenderer.removeListener(IPC_CHANNELS.GET_PROMPT, listener)
	},
	onShowLoading: (callback: () => void) => onIpcSignal(IPC_CHANNELS.SHOW_LOADING, callback),
	onLanguageDetected: (callback: (language: string) => void) => onIpc(IPC_CHANNELS.LANGUAGE_DETECTED, callback),
	onModelChanged: (callback: (model: string | ModelChangedPayload) => void) =>
		onIpc(IPC_CHANNELS.MODEL_CHANGED, callback),
	onModelsLoading: (callback: () => void) => onIpcSignal(IPC_CHANNELS.MODELS_LOADING, callback),
	resizeWindow: (width: number, height: number) => {
		const payload = { width, height }
		if (!isValidResizeWindowPayload(payload)) {
			console.warn('Rejected invalid resize payload', payload)
			return
		}
		ipcRenderer.send(IPC_CHANNELS.RESIZE_WINDOW, payload)
	},
} as ApiInterface)

ipcRenderer.on(IPC_CHANNELS.TRIGGER_SCREENSHOT, () => {
	try {
		console.log('Screenshot capture triggered from main process')
		ipcRenderer.send(IPC_CHANNELS.REQUEST_SCREENSHOT)
	} catch (err) {
		console.error('Error in trigger-screenshot handler:', err)
	}
})

declare global {
	interface Window {
		api: ApiInterface
	}
}

if (typeof window !== 'undefined') {
	try {
		Object.defineProperty(window, 'Autofill', {
			value: {
				enable: () => Promise.resolve({}),
				setAddresses: () => Promise.resolve({}),
				getAddresses: () => Promise.resolve([]),
				getAutofillableFields: () => Promise.resolve([]),
				setAutofillableFields: () => Promise.resolve({}),
			},
			writable: false,
			configurable: false,
		})

		console.log('Autofill protocol stubs installed successfully')
	} catch (error) {
		console.warn('Failed to install Autofill protocol stubs:', error)
	}
}

window.addEventListener('error', (event) => {
	const errorMessage = event.message || 'Unknown error'
	const errorSource = event.filename || 'Unknown source'
	const lineNumber = event.lineno || 'Unknown line'
	const colNumber = event.colno || 'Unknown column'

	console.error(`Renderer error: ${errorMessage} at ${errorSource}:${lineNumber}:${colNumber}`)

	if (
		errorMessage.includes('Autofill') ||
		errorMessage.includes('DevTools') ||
		errorMessage.includes('protocol') ||
		errorSource?.includes('devtools://') ||
		errorMessage?.includes("wasn't found")
	) {
		console.warn('DevTools Protocol error detected. This can be safely ignored.')
		event.preventDefault()
		return true
	}
})

const originalConsoleError = console.error
console.error = (...args) => {
	if (
		args.length > 0 &&
		typeof args[0] === 'string' &&
		(args[0].includes('Autofill') ||
			args[0].includes("wasn't found") ||
			args[0].includes('DevTools Protocol') ||
			args[0].includes('protocol_client.js'))
	) {
		return
	}

	originalConsoleError.apply(console, args)
}
