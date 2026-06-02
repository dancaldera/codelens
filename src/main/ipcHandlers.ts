import type { BrowserWindow, IpcMain, Shell } from 'electron'
import { IPC_CHANNELS, isValidResizeWindowPayload, isValidScreenshotIndex, isValidVoiceAudioPayload } from '../ipc'
import type { AnalysisSession } from './analysisSession'
import type { ScreenshotSession } from './screenshotSession'
import type { VoiceSession } from './voiceSession'

interface IpcLogger {
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface RegisterIpcHandlersOptions {
	ipcMain: IpcMain
	shell: Shell
	getWindow: () => BrowserWindow | null
	screenshotSession: ScreenshotSession
	analysisSession: AnalysisSession
	voiceSession: VoiceSession
	cancelScheduledAnalysis: () => void
	logger: IpcLogger
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
	for (const channel of [
		IPC_CHANNELS.RESIZE_WINDOW,
		IPC_CHANNELS.REQUEST_SCREENSHOT,
		IPC_CHANNELS.OPEN_SCREENSHOT,
		IPC_CHANNELS.SUBMIT_PROMPT,
		IPC_CHANNELS.VOICE_AUDIO_RECORDED,
	]) {
		options.ipcMain.removeAllListeners(channel)
	}
	options.ipcMain.removeHandler(IPC_CHANNELS.GET_CURRENT_MODEL)
	options.ipcMain.removeHandler(IPC_CHANNELS.GET_CURRENT_STT_MODEL)

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

	options.ipcMain.on(IPC_CHANNELS.REQUEST_SCREENSHOT, () => {
		void options.screenshotSession.capture()
	})

	options.ipcMain.on(IPC_CHANNELS.OPEN_SCREENSHOT, (_event, index: unknown) => {
		if (!isValidScreenshotIndex(index)) {
			options.logger.warn('Rejected invalid screenshot index', { index })
			return
		}

		const screenshotPath = options.screenshotSession.getPath(index)
		if (!screenshotPath) {
			options.getWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, `Screenshot ${index} is not available`)
			return
		}

		void options.shell.openPath(screenshotPath).then((errorMessage) => {
			if (errorMessage) {
				options.logger.warn('Failed to open screenshot', { screenshotPath, errorMessage })
			}
		})
	})

	options.ipcMain.handle(IPC_CHANNELS.GET_CURRENT_MODEL, async () => {
		await options.analysisSession.initializeProvider()
		return options.analysisSession.getCurrentModelInfo()
	})

	options.ipcMain.handle(IPC_CHANNELS.GET_CURRENT_STT_MODEL, async () => {
		await options.voiceSession.initializeModels()
		return options.voiceSession.getCurrentModelInfo()
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

	options.ipcMain.on(IPC_CHANNELS.SUBMIT_PROMPT, async () => {
		const window = options.getWindow()
		if (!window) return

		if (!options.analysisSession.hasAnalyzableContext()) {
			window.webContents.send(
				IPC_CHANNELS.ANALYSIS_RESULT,
				'No screenshots or voice context available for analysis. Capture a screenshot or record a voice note first.',
			)
			return
		}

		options.cancelScheduledAnalysis()
		window.webContents.send(IPC_CHANNELS.SHOW_LOADING)
		await options.analysisSession.triggerAnalysis()
	})
}
