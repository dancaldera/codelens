import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../ipc'
import type { Logger } from '../lib'
import { getAvailableTranscriptionModels, getProvider, isProviderConfigured } from '../services/providers'
import { transcribeAudio } from '../services/stt'

export interface VoiceSessionOptions {
	getWindow: () => BrowserWindow | null
	onVoiceSettled?: () => void
	logger: Logger
}

export class VoiceSession {
	private latestTranscript: string | null = null
	private currentModelIndex = 0
	private availableModels: string[] = []
	private lastModelsError: string | null = null
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

		const info: ModelChangedPayload = {
			provider: getProvider().id,
			model: currentModel,
			index: this.currentModelIndex,
			count: this.availableModels.length,
		}
		if (this.lastModelsError) info.error = this.lastModelsError
		return info
	}

	reloadModels(): Promise<void> {
		this.availableModels = []
		this.currentModelIndex = 0
		this.lastModelsError = null
		return this.initializeModels()
	}

	switchModel(): void {
		const window = this.options.getWindow()
		const provider = getProvider()
		if (!provider.transcription) {
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'STT unavailable')
			return
		}
		if (!isProviderConfigured(provider.id)) {
			this.options.logger.warn('Attempted to switch STT model without provider configured', {
				provider: provider.id,
			})
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

		const provider = getProvider()
		if (!provider.transcription) {
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'STT unavailable')
			this.captureState = 'idle'
			this.options.onVoiceSettled?.()
			return
		}

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
				provider,
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
			const message = error instanceof Error ? error.message : String(error)
			this.options.logger.error('Voice transcription failed', { error: message })
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, `Transcription failed: ${message.slice(0, 80)}`)
		} finally {
			this.isTranscribing = false
			this.captureState = 'idle'
			this.options.onVoiceSettled?.()
		}
	}

	private async loadModels(): Promise<void> {
		const window = this.options.getWindow()
		const provider = getProvider()
		window?.webContents.send(IPC_CHANNELS.STT_MODELS_LOADING)

		if (!provider.transcription) {
			this.options.logger.info('Active provider has no transcription support', { provider: provider.id })
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'STT unavailable')
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'no-stt')
			return
		}

		if (!isProviderConfigured(provider.id)) {
			this.options.logger.warn('Provider API key missing for STT models', { provider: provider.id })
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'no-key')
			return
		}

		try {
			const available = await getAvailableTranscriptionModels(provider)
			this.availableModels = available.ids
			this.currentModelIndex = 0
			this.lastModelsError = available.error

			this.options.logger.info('STT models initialized', {
				provider: provider.id,
				models: this.availableModels,
				count: this.availableModels.length,
				defaultModel: this.availableModels[0],
				catalogError: available.error,
			})
		} catch (error) {
			this.options.logger.error('Failed to fetch STT models', { error })
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'models-error')
			return
		}

		const modelInfo = this.getCurrentModelInfo()
		if (modelInfo) {
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, modelInfo)
		}
	}
}
