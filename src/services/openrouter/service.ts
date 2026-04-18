import { createLogger, logApiCall } from '../../lib/logger'
import { createOpenRouterClient, validateOpenRouterConfiguration } from './client'

const logger = createLogger('OpenRouterService')

export interface ImageContent {
	type: 'image_url'
	image_url: { url: string }
}

export interface AnalysisRequest {
	images: ImageContent[]
	prompt: string
	previousContext?: string
}

export interface OpenRouterServiceOptions {
	model?: string
	maxTokens?: number
	temperature?: number
	timeout?: number
}

export class OpenRouterService {
	private readonly options: Required<OpenRouterServiceOptions>

	constructor(options: OpenRouterServiceOptions = {}) {
		this.options = {
			model: options.model || 'openai/gpt-4o',
			maxTokens: options.maxTokens || 2000,
			temperature: options.temperature || 0.2,
			timeout: options.timeout || 50000,
		}
	}

	async analyze(request: AnalysisRequest): Promise<string> {
		validateOpenRouterConfiguration()

		const client = createOpenRouterClient()
		const userText = request.previousContext
			? `${request.prompt}\n\nPrevious analysis context:\n${request.previousContext}`
			: request.prompt

		const apiCallStart = Date.now()
		logger.info('Calling OpenRouter API', { model: this.options.model, images: request.images.length })

		try {
			const response = await client.chat.completions.create({
				model: this.options.model,
				messages: [
					{
						role: 'user',
						content: [{ type: 'text' as const, text: userText }, ...request.images],
					},
				],
				max_tokens: this.options.maxTokens,
				temperature: this.options.temperature,
			})

			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 200, apiCallTime, {
				provider: 'openrouter',
				model: this.options.model,
				imageCount: request.images.length,
			})

			return response.choices[0]?.message.content || ''
		} catch (error) {
			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 500, apiCallTime, {
				provider: 'openrouter',
				model: this.options.model,
				error: error instanceof Error ? error.message : String(error),
			})
			throw new Error(`OpenRouter API call failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

export const openRouterService = new OpenRouterService()
