import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import type {
	LoadingStatusPayload,
	ModelChangedPayload,
	SaveSettingsPayload,
	ScreenshotImagePayload,
	SettingsConfig,
	VoiceAudioPayload,
	VoiceCaptureStatePayload,
} from './ipc'
import {
	IPC_CHANNELS,
	isValidLoadingStatusPayload,
	isValidResizeWindowPayload,
	isValidVoiceAudioPayload,
	isValidVoiceCaptureStatePayload,
} from './ipc'

type Unsubscribe = () => void

interface ApiInterface {
	onAnalysisResult: (callback: (result: string) => void) => Unsubscribe
	onAnalysisChunk: (callback: (chunk: string) => void) => Unsubscribe
	onContextReset: (callback: () => void) => Unsubscribe
	onScreenshotImage: (callback: (imageData: ScreenshotImagePayload) => void) => Unsubscribe
	onClearScreenshots: (callback: () => void) => Unsubscribe
	onShowLoading: (callback: (status?: LoadingStatusPayload) => void) => Unsubscribe
	onHideLoading: (callback: () => void) => Unsubscribe
	onModelChanged: (callback: (model: string | ModelChangedPayload) => void) => Unsubscribe
	onModelsLoading: (callback: () => void) => Unsubscribe
	getCurrentModel: () => Promise<ModelChangedPayload | null>
	onSttModelChanged: (callback: (model: string | ModelChangedPayload) => void) => Unsubscribe
	onSttModelsLoading: (callback: () => void) => Unsubscribe
	getCurrentSttModel: () => Promise<ModelChangedPayload | null>
	onToggleVoiceRecording: (callback: () => void) => Unsubscribe
	sendVoiceAudio: (payload: VoiceAudioPayload) => void
	setVoiceCaptureState: (payload: VoiceCaptureStatePayload) => void
	onVoiceStatus: (callback: (status: string) => void) => Unsubscribe
	onVoiceTranscriptReady: (callback: () => void) => Unsubscribe
	resizeWindow: (width: number, height: number) => void
	getSettingsConfig: () => Promise<SettingsConfig | null>
	saveSettingsConfig: (payload: SaveSettingsPayload) => Promise<{ ok: boolean; error?: string }>
	closeWindow: () => void
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
	onAnalysisResult: (callback: (result: string) => void) => onIpc(IPC_CHANNELS.ANALYSIS_RESULT, callback),
	onAnalysisChunk: (callback: (chunk: string) => void) => onIpc(IPC_CHANNELS.ANALYSIS_CHUNK, callback),
	onContextReset: (callback: () => void) => onIpcSignal(IPC_CHANNELS.CONTEXT_RESET, callback),
	onScreenshotImage: (callback: (imageData: ScreenshotImagePayload) => void) =>
		onIpc(IPC_CHANNELS.SCREENSHOT_IMAGE, callback),
	onClearScreenshots: (callback: () => void) => onIpcSignal(IPC_CHANNELS.CLEAR_SCREENSHOTS, callback),
	onShowLoading: (callback: (status?: LoadingStatusPayload) => void) => {
		const listener = (_event: IpcRendererEvent, payload?: LoadingStatusPayload) => {
			if (typeof payload === 'undefined' || isValidLoadingStatusPayload(payload)) {
				callback(payload)
			}
		}
		ipcRenderer.on(IPC_CHANNELS.SHOW_LOADING, listener)
		return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_LOADING, listener)
	},
	onHideLoading: (callback: () => void) => onIpc(IPC_CHANNELS.HIDE_LOADING, callback),
	onModelChanged: (callback: (model: string | ModelChangedPayload) => void) =>
		onIpc(IPC_CHANNELS.MODEL_CHANGED, callback),
	onModelsLoading: (callback: () => void) => onIpcSignal(IPC_CHANNELS.MODELS_LOADING, callback),
	getCurrentModel: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_MODEL),
	onSttModelChanged: (callback: (model: string | ModelChangedPayload) => void) =>
		onIpc(IPC_CHANNELS.STT_MODEL_CHANGED, callback),
	onSttModelsLoading: (callback: () => void) => onIpcSignal(IPC_CHANNELS.STT_MODELS_LOADING, callback),
	getCurrentSttModel: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_STT_MODEL),
	onToggleVoiceRecording: (callback: () => void) => onIpcSignal(IPC_CHANNELS.TOGGLE_VOICE_RECORDING, callback),
	sendVoiceAudio: (payload: VoiceAudioPayload) => {
		if (!isValidVoiceAudioPayload(payload)) {
			console.warn('Rejected invalid voice audio payload')
			return
		}
		ipcRenderer.send(IPC_CHANNELS.VOICE_AUDIO_RECORDED, payload)
	},
	setVoiceCaptureState: (payload: VoiceCaptureStatePayload) => {
		if (!isValidVoiceCaptureStatePayload(payload)) {
			console.warn('Rejected invalid voice capture state payload')
			return
		}
		ipcRenderer.send(IPC_CHANNELS.VOICE_CAPTURE_STATE, payload)
	},
	onVoiceStatus: (callback: (status: string) => void) => onIpc(IPC_CHANNELS.VOICE_STATUS, callback),
	onVoiceTranscriptReady: (callback: () => void) => onIpcSignal(IPC_CHANNELS.VOICE_TRANSCRIPT_READY, callback),
	resizeWindow: (width: number, height: number) => {
		const payload = { width, height }
		if (!isValidResizeWindowPayload(payload)) {
			console.warn('Rejected invalid resize payload', payload)
			return
		}
		ipcRenderer.send(IPC_CHANNELS.RESIZE_WINDOW, payload)
	},
	getSettingsConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS_CONFIG),
	saveSettingsConfig: (payload: SaveSettingsPayload) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS_CONFIG, payload),
	closeWindow: () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW),
} as ApiInterface)

declare global {
	interface Window {
		api: ApiInterface
	}
}
