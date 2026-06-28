import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type ModelChangedPayload, type VoiceAudioPayload, type VoiceCaptureStatePayload } from '../ipc'
import { fetchTranscriptionModels, isOpenRouterConfigured } from '../services/openrouter/client'
import { transcribeAudio } from '../services/stt'

interface VoiceLogger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface VoiceSessionOptions {
	getWindow: () => BrowserWindow | null
	onVoiceSettled?: () => void
	logger: VoiceLogger
}

export class VoiceSession {
	private latestTranscript: string | null = null
	private currentModelIndex = 0
	private availableModels: string[] = []
	private modelInitializationPromise: Promise<void> | null = null
	private isTranscribing = false
	private captureState: VoiceCaptureStatePayload['state'] = 'idle'

	constructor(private readonly options: VoiceSessionOptions) {}

	getTranscript(): string | undefined {
		return this.latestTranscript || undefined
	}

	hasTranscript(): boolean {
		return !!this.latestTranscript?.trim()
	}

	isVoiceBusy(): boolean {
		return this.captureState === 'recording' || this.captureState === 'processing' || this.isTranscribing
	}

	isRecording(): boolean {
		return this.captureState === 'recording'
	}

	setCaptureState(payload: VoiceCaptureStatePayload): void {
		this.captureState = payload.state
		this.options.logger.debug('Voice capture state updated', { state: payload.state })
		if (payload.state === 'idle' || payload.state === 'error') {
			this.options.onVoiceSettled?.()
		}
	}

	reset(): void {
		this.latestTranscript = null
		this.captureState = 'idle'
		this.isTranscribing = false
		this.options.getWindow()?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Cleared')
	}

	async initializeModels(): Promise<void> {
		if (this.modelInitializationPromise) return this.modelInitializationPromise

		this.modelInitializationPromise = this.loadModels()
		try {
			await this.modelInitializationPromise
		} finally {
			this.modelInitializationPromise = null
		}
	}

	getCurrentModelInfo(): ModelChangedPayload | null {
		const currentModel = this.availableModels[this.currentModelIndex]
		if (!currentModel) return null

		return {
			provider: 'openrouter',
			model: currentModel,
			index: this.currentModelIndex,
			count: this.availableModels.length,
		}
	}

	switchModel(): void {
		const window = this.options.getWindow()
		if (!isOpenRouterConfigured()) {
			this.options.logger.warn('Attempted to switch STT model without OpenRouter configured')
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No API key')
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'no-key')
			return
		}

		if (!this.availableModels.length) {
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Loading models…')
			void this.initializeModels()
			return
		}

		this.currentModelIndex = (this.currentModelIndex + 1) % this.availableModels.length
		const modelInfo = this.getCurrentModelInfo()
		if (!modelInfo) return

		this.options.logger.info('STT model switched', {
			model: modelInfo.model,
			index: this.currentModelIndex,
		})

		window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, modelInfo)
		window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, `Voice model: ${modelInfo.model}`)
	}

	async handleAudio(payload: VoiceAudioPayload): Promise<void> {
		const window = this.options.getWindow()
		if (!window) return

		if (this.isTranscribing) {
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Transcribing')
			return
		}

		this.isTranscribing = true
		this.captureState = 'processing'
		window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Transcribing')

		try {
			if (!this.availableModels.length) {
				await this.initializeModels()
			}

			const currentModel = this.availableModels[this.currentModelIndex]
			if (!currentModel) {
				window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No STT model')
				return
			}

			const transcript = await transcribeAudio({
				audioBase64: payload.data,
				mimeType: payload.mimeType,
				model: currentModel,
			})

			if (!transcript) {
				window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No speech')
				return
			}

			this.latestTranscript = transcript
			window.webContents.send(IPC_CHANNELS.VOICE_TRANSCRIPT_READY)
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Ready')
			this.options.logger.info('Voice context updated', {
				model: currentModel,
				durationMs: Math.round(payload.durationMs),
				transcriptLength: transcript.length,
			})
		} catch (error) {
			this.options.logger.error('Voice transcription failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Transcription failed')
		} finally {
			this.isTranscribing = false
			this.captureState = 'idle'
			this.options.onVoiceSettled?.()
		}
	}

	private async loadModels(): Promise<void> {
		const window = this.options.getWindow()
		window?.webContents.send(IPC_CHANNELS.STT_MODELS_LOADING)

		if (!isOpenRouterConfigured()) {
			this.options.logger.warn('OpenRouter API key missing for STT models')
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'no-key')
			return
		}

		this.availableModels = (await fetchTranscriptionModels()).map((model) => model.id)
		this.currentModelIndex = 0

		this.options.logger.info('STT models initialized', {
			models: this.availableModels,
			count: this.availableModels.length,
			defaultModel: this.availableModels[0],
		})

		const modelInfo = this.getCurrentModelInfo()
		if (modelInfo) {
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, modelInfo)
		}
	}
}
