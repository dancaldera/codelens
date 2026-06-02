import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type ModelChangedPayload, type VoiceAudioPayload } from '../ipc'
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
	logger: VoiceLogger
}

export class VoiceSession {
	private latestTranscript: string | null = null
	private currentModelIndex = 0
	private availableModels: string[] = []
	private modelInitializationPromise: Promise<void> | null = null
	private isTranscribing = false

	constructor(private readonly options: VoiceSessionOptions) {}

	getTranscript(): string | undefined {
		return this.latestTranscript || undefined
	}

	reset(): void {
		this.latestTranscript = null
		this.options.getWindow()?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Voice context cleared')
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
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No OpenRouter API key configured')
			window?.webContents.send(IPC_CHANNELS.STT_MODEL_CHANGED, 'no-key')
			return
		}

		if (!this.availableModels.length) {
			window?.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'STT models are still loading')
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
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Already transcribing voice note')
			return
		}

		this.isTranscribing = true
		window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Transcribing voice note…')

		try {
			if (!this.availableModels.length) {
				await this.initializeModels()
			}

			const currentModel = this.availableModels[this.currentModelIndex]
			if (!currentModel) {
				window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No STT model available')
				return
			}

			const transcript = await transcribeAudio({
				audioBase64: payload.data,
				mimeType: payload.mimeType,
				model: currentModel,
			})

			if (!transcript) {
				window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'No speech detected')
				return
			}

			this.latestTranscript = transcript
			window.webContents.send(IPC_CHANNELS.VOICE_TRANSCRIPT_READY)
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Voice context ready')
			this.options.logger.info('Voice context updated', {
				model: currentModel,
				durationMs: Math.round(payload.durationMs),
				transcriptLength: transcript.length,
			})
		} catch (error) {
			this.options.logger.error('Voice transcription failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			window.webContents.send(IPC_CHANNELS.VOICE_STATUS, 'Voice transcription failed')
		} finally {
			this.isTranscribing = false
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
