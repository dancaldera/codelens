import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type ModelChangedPayload } from '../ipc'
import { getAvailableModels, isAnyProviderConfigured } from '../services/providers'
import { analyzeImagesSmart } from '../services/smartAnalyzer'

interface AnalysisLogger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface AnalysisSessionOptions {
	getWindow: () => BrowserWindow | null
	getImagePaths: () => string[]
	getVoiceContext?: () => string | undefined
	logger: AnalysisLogger
}

export class AnalysisSession {
	private previousAnalysis: string | null = null
	private currentModelIndex = 0
	private availableModels: string[] = []
	private currentProvider = 'openrouter'
	private isAnalysisRunning = false
	private pendingAnalysis = false
	private analysisPromise: Promise<void> | null = null
	private providerInitializationPromise: Promise<void> | null = null

	constructor(private readonly options: AnalysisSessionOptions) {}

	hasPreviousAnalysis(): boolean {
		return !!this.previousAnalysis
	}

	hasAnalyzableContext(): boolean {
		return this.options.getImagePaths().length > 0 || !!this.options.getVoiceContext?.()?.trim()
	}

	resetContext(): void {
		this.previousAnalysis = null
		this.pendingAnalysis = false
	}

	async initializeProvider(): Promise<void> {
		if (this.providerInitializationPromise) return this.providerInitializationPromise

		this.providerInitializationPromise = this.loadProvider()
		try {
			await this.providerInitializationPromise
		} finally {
			this.providerInitializationPromise = null
		}
	}

	getCurrentModelInfo(): ModelChangedPayload | null {
		const currentModel = this.availableModels[this.currentModelIndex]
		if (!currentModel) return null

		return {
			provider: this.currentProvider,
			model: currentModel,
			index: this.currentModelIndex,
			count: this.availableModels.length,
		}
	}

	private async loadProvider(): Promise<void> {
		const window = this.options.getWindow()

		window?.webContents.send(IPC_CHANNELS.MODELS_LOADING)

		try {
			this.availableModels = await getAvailableModels()
			this.currentModelIndex = 0

			this.options.logger.info('Provider initialized', {
				provider: this.currentProvider,
				models: this.availableModels,
				count: this.availableModels.length,
				defaultModel: this.availableModels[0],
			})

			const modelInfo = this.getCurrentModelInfo()
			if (modelInfo) {
				window?.webContents.send(IPC_CHANNELS.MODEL_CHANGED, modelInfo)
			}
		} catch (error) {
			this.options.logger.error('Failed to fetch models', { error })
			window?.webContents.send(IPC_CHANNELS.MODEL_CHANGED, 'no-key')
		}
	}

	switchModel(): void {
		const window = this.options.getWindow()
		if (!isAnyProviderConfigured()) {
			this.options.logger.warn('Attempted to switch model without any provider configured')
			return
		}

		if (!this.availableModels.length) {
			return
		}

		this.currentModelIndex = (this.currentModelIndex + 1) % this.availableModels.length
		const modelInfo = this.getCurrentModelInfo()
		if (!modelInfo) return

		this.options.logger.info('Model switched', {
			provider: this.currentProvider,
			model: modelInfo.model,
			index: this.currentModelIndex,
		})

		window?.webContents.send(IPC_CHANNELS.MODEL_CHANGED, modelInfo)
	}

	async triggerAnalysis(): Promise<void> {
		const window = this.options.getWindow()
		if (!window || !this.hasAnalyzableContext()) return

		if (this.isAnalysisRunning) {
			this.pendingAnalysis = true
			return this.analysisPromise ?? Promise.resolve()
		}

		this.isAnalysisRunning = true
		this.pendingAnalysis = false

		const currentPromise = this.prepareAndRunAnalysis()
		this.analysisPromise = currentPromise
		await currentPromise
	}

	private async prepareAndRunAnalysis(): Promise<void> {
		try {
			if (!this.availableModels.length) {
				await this.initializeProvider()
			}

			const currentModel = this.availableModels[this.currentModelIndex]
			if (!currentModel) {
				this.options.logger.warn('No model available for analysis', {
					modelIndex: this.currentModelIndex,
					models: this.availableModels,
				})
				return
			}

			await this.runAnalysis(currentModel)
		} finally {
			this.isAnalysisRunning = false
			this.analysisPromise = null

			if (this.pendingAnalysis && this.options.getWindow() && this.hasAnalyzableContext()) {
				this.pendingAnalysis = false
				await this.triggerAnalysis()
			}
		}
	}

	private async runAnalysis(currentModel: string): Promise<void> {
		try {
			const imagePaths = this.options.getImagePaths()
			const voiceContext = this.options.getVoiceContext?.()
			this.options.logger.info('Starting analysis', {
				imageCount: imagePaths.length,
				hasVoiceContext: !!voiceContext?.trim(),
				hasPreviousAnalysis: !!this.previousAnalysis,
				model: currentModel,
				provider: this.currentProvider,
			})

			const markdownResult = await analyzeImagesSmart({
				imagePaths,
				previousContext: this.previousAnalysis || undefined,
				voiceContext,
				model: currentModel,
			})

			this.previousAnalysis = markdownResult
			this.options.getWindow()?.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, markdownResult)

			this.options.logger.info('Analysis completed successfully')
		} catch (error) {
			this.handleAnalysisError(error)
		}
	}

	private handleAnalysisError(error: unknown): void {
		this.options.logger.error('Analysis failed', {
			error: error instanceof Error ? error.message : String(error),
		})

		const errorMessage = `# Analysis Failed

An error occurred during screenshot analysis: ${error instanceof Error ? error.message : 'Unknown error'}

Please try again or check your OpenRouter API key configuration.`

		this.options.getWindow()?.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, errorMessage)
	}
}
