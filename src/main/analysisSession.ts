import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type ModelChangedPayload } from '../ipc'
import { analyzeImagesSmart } from '../services'
import { getAvailableModels, getCurrentProvider, isAnyProviderConfigured, type Provider } from '../services/providers'

interface AnalysisLogger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface AnalysisSessionOptions {
	getWindow: () => BrowserWindow | null
	getImagePaths: () => string[]
	logger: AnalysisLogger
}

export class AnalysisSession {
	private previousAnalysis: string | null = null
	private currentModelIndex = 0
	private availableModels: string[] = []
	private currentProvider: Provider = 'openrouter'
	private isAnalysisRunning = false
	private pendingAnalysis = false
	private analysisPromise: Promise<void> | null = null
	private providerInitializationPromise: Promise<void> | null = null

	constructor(private readonly options: AnalysisSessionOptions) {}

	hasPreviousAnalysis(): boolean {
		return !!this.previousAnalysis
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
		this.currentProvider = getCurrentProvider()
		const window = this.options.getWindow()

		window?.webContents.send(IPC_CHANNELS.MODELS_LOADING)

		try {
			this.availableModels = await getAvailableModels(this.currentProvider)
			this.currentModelIndex = 0

			this.options.logger.info('Provider initialized', {
				provider: this.currentProvider,
				models: this.availableModels,
				count: this.availableModels.length,
				defaultModel: this.availableModels[0],
			})

			const modelInfo = this.getCurrentModelInfo()
			if (modelInfo) {
				this.publishModelChanged(modelInfo)
			}
		} catch (error) {
			this.options.logger.error('Failed to fetch models', { error })
			this.publishModelChanged('no-key')
		}
	}

	switchModel(): void {
		const window = this.options.getWindow()
		if (!isAnyProviderConfigured()) {
			this.options.logger.warn('Attempted to switch model without any provider configured')
			window?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'No API key configured')
			return
		}

		if (!this.availableModels.length) {
			window?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Models are still loading')
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

		this.publishModelChanged(modelInfo)
		window?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, `Model: ${this.currentProvider}:${modelInfo.model}`)
	}

	private publishModelChanged(modelInfo: ModelChangedPayload | 'no-key'): void {
		const window = this.options.getWindow()
		window?.webContents.send(IPC_CHANNELS.MODEL_CHANGED, modelInfo)
		this.renderModelBadgeDirectly(modelInfo)
	}

	private renderModelBadgeDirectly(modelInfo: ModelChangedPayload | 'no-key'): void {
		const window = this.options.getWindow()
		if (!window || window.webContents.isDestroyed()) return

		const script = `(() => {
			const el = document.getElementById('modelInfo');
			if (!el) return;
			const info = ${JSON.stringify(modelInfo)};
			const setText = (className, text) => {
				const node = document.createElement('div');
				node.className = className;
				node.textContent = text;
				return node;
			};
			el.replaceChildren();
			el.classList.add('show');
			if (info === 'no-key') {
				el.dataset.model = 'no-key';
				el.title = 'OpenRouter API key missing';
				el.append(setText('badge-provider', 'OpenRouter'), setText('badge-model', 'No API Key'));
				return;
			}
			const [vendor, ...nameParts] = info.model.split('/');
			const name = nameParts.length ? nameParts.join('/') : info.model;
			const count = Number.isInteger(info.index) && Number.isInteger(info.count) ? ' · ' + (info.index + 1) + '/' + info.count : '';
			el.dataset.model = info.model.toLowerCase();
			el.title = info.provider + ': ' + info.model;
			el.append(setText('badge-provider', 'OpenRouter' + (vendor ? ' • ' + vendor : '') + count), setText('badge-model', name));
		})()`

		void window.webContents.executeJavaScript(script).catch((error) => {
			this.options.logger.warn('Failed to render model badge directly', {
				error: error instanceof Error ? error.message : String(error),
			})
		})
	}

	async triggerAnalysis(): Promise<void> {
		const window = this.options.getWindow()
		const imagePaths = this.options.getImagePaths()

		if (!window || imagePaths.length === 0) return

		if (this.isAnalysisRunning) {
			this.pendingAnalysis = true
			return this.analysisPromise ?? Promise.resolve()
		}

		this.isAnalysisRunning = true
		this.pendingAnalysis = false

		const currentPromise = this.prepareAndRunAnalysis(window)
		this.analysisPromise = currentPromise
		await currentPromise
	}

	private async prepareAndRunAnalysis(window: BrowserWindow): Promise<void> {
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
				window.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'No model available')
				return
			}

			await this.runAnalysis(currentModel)
		} finally {
			this.isAnalysisRunning = false
			this.analysisPromise = null

			if (this.pendingAnalysis && this.options.getWindow() && this.options.getImagePaths().length > 0) {
				this.pendingAnalysis = false
				await this.triggerAnalysis()
			}
		}
	}

	private async runAnalysis(currentModel: string): Promise<void> {
		try {
			const imagePaths = this.options.getImagePaths()
			this.options.logger.info('Starting analysis', {
				imageCount: imagePaths.length,
				hasPreviousAnalysis: !!this.previousAnalysis,
				model: currentModel,
				provider: this.currentProvider,
			})

			const markdownResult = await analyzeImagesSmart({
				imagePaths,
				previousContext: this.previousAnalysis || undefined,
				model: currentModel,
				provider: this.currentProvider,
			})

			this.previousAnalysis = markdownResult
			this.options.getWindow()?.webContents.send(IPC_CHANNELS.ANALYSIS_RESULT, markdownResult)
			this.options.getWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Analysis completed')

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
		this.options.getWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Analysis failed')
	}
}
