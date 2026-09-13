import type { App, BrowserWindow, IpcMain } from 'electron'
import {
	IPC_CHANNELS,
	isValidResizeWindowPayload,
	isValidSaveSettingsPayload,
	isValidVoiceAudioPayload,
	isValidVoiceCaptureStatePayload,
} from '../ipc'
import type { Logger } from '../lib'
import { clearModelCache, listProviders } from '../services/providers'
import type { AnalysisSession } from './analysisSession'
import { readSettingsConfig, saveSettingsConfig } from './configStore'
import type { ScreenshotSession } from './screenshotSession'
import type { VoiceSession } from './voiceSession'

export interface RegisterIpcHandlersOptions {
	ipcMain: IpcMain
	app: App
	getWindow: () => BrowserWindow | null
	screenshotSession: ScreenshotSession
	analysisSession: AnalysisSession
	voiceSession: VoiceSession
	cancelScheduledAnalysis: () => void
	scheduleAnalysis: (delay?: number, allowSingleScreenshot?: boolean) => void
	logger: Logger
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
	for (const channel of [
		IPC_CHANNELS.RESIZE_WINDOW,
		IPC_CHANNELS.VOICE_AUDIO_RECORDED,
		IPC_CHANNELS.VOICE_CAPTURE_STATE,
	]) {
		options.ipcMain.removeAllListeners(channel)
	}
	options.ipcMain.removeHandler(IPC_CHANNELS.GET_CURRENT_MODEL)
	options.ipcMain.removeHandler(IPC_CHANNELS.GET_CURRENT_STT_MODEL)
	options.ipcMain.removeHandler(IPC_CHANNELS.GET_SETTINGS_CONFIG)
	options.ipcMain.removeHandler(IPC_CHANNELS.SAVE_SETTINGS_CONFIG)

	options.ipcMain.on(IPC_CHANNELS.RESIZE_WINDOW, (_event, payload: unknown) => {
		const window = options.getWindow()
		if (!window) return

		if (!isValidResizeWindowPayload(payload)) {
			options.logger.warn('Rejected invalid resize-window payload', { payload })
			return
		}

		window.setSize(Math.round(payload.width), Math.round(payload.height))
		options.logger.info('Window resized', { width: payload.width, height: payload.height })
	})

	options.ipcMain.handle(IPC_CHANNELS.GET_CURRENT_MODEL, async () => {
		await options.analysisSession.initializeProvider()
		return options.analysisSession.getCurrentModelInfo()
	})

	options.ipcMain.handle(IPC_CHANNELS.GET_CURRENT_STT_MODEL, async () => {
		await options.voiceSession.initializeModels()
		return options.voiceSession.getCurrentModelInfo()
	})

	options.ipcMain.on(IPC_CHANNELS.VOICE_CAPTURE_STATE, (_event, payload: unknown) => {
		if (!isValidVoiceCaptureStatePayload(payload)) {
			options.logger.warn('Rejected invalid voice capture state payload', { payload })
			return
		}

		options.voiceSession.setCaptureState(payload)
	})

	options.ipcMain.on(IPC_CHANNELS.VOICE_AUDIO_RECORDED, (_event, payload: unknown) => {
		if (!isValidVoiceAudioPayload(payload)) {
			options.logger.warn('Rejected invalid voice audio payload')
			options.getWindow()?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Invalid voice recording')
			return
		}

		void options.voiceSession.handleAudio(payload).catch((error) => {
			options.logger.error('Voice transcription handler failed', {
				error: error instanceof Error ? error.message : String(error),
			})
		})
	})

	// The config payload contains plaintext API keys — only serve it to the
	// settings window, not the overlay renderer (they share the preload).
	const isSettingsFrame = (event: Electron.IpcMainInvokeEvent): boolean =>
		event.senderFrame?.url.endsWith('/settings.html') ?? false

	options.ipcMain.handle(IPC_CHANNELS.GET_SETTINGS_CONFIG, (event) => {
		if (!isSettingsFrame(event)) {
			options.logger.warn('Rejected settings read from non-settings frame', { url: event.senderFrame?.url })
			return null
		}
		return readSettingsConfig()
	})

	options.ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS_CONFIG, (event, payload: unknown) => {
		if (!isSettingsFrame(event)) {
			options.logger.warn('Rejected settings save from non-settings frame', { url: event.senderFrame?.url })
			return { ok: false, error: 'Settings can only be changed from the settings window' }
		}

		const providers = listProviders()
		const allowedProviders = providers.map((provider) => provider.id)
		const allowedKeys = providers.map((provider) => provider.envKey)

		if (!isValidSaveSettingsPayload(payload, allowedProviders, allowedKeys)) {
			options.logger.warn('Rejected invalid save-settings payload', { payload })
			return { ok: false, error: 'Invalid settings payload' }
		}

		try {
			saveSettingsConfig(options.app, payload, options.logger)
			clearModelCache()
			void options.analysisSession.reloadProvider()
			void options.voiceSession.reloadModels()
			return { ok: true }
		} catch (error) {
			options.logger.error('Failed to save settings', {
				error: error instanceof Error ? error.message : String(error),
			})
			return { ok: false, error: error instanceof Error ? error.message : 'Failed to save settings' }
		}
	})
}
