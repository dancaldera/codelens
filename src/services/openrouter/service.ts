import { createLogger, logApiCall } from '../../lib/logger'
import { chatCompletion, DEFAULT_PROGRAMMING_VISION_MODEL } from './client'

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

export interface AnalyzeOptions {
	model?: string
	maxTokens?: number
	temperature?: number
}

export async function analyze(request: AnalysisRequest, options: AnalyzeOptions = {}): Promise<string> {
	const model = options.model ?? DEFAULT_PROGRAMMING_VISION_MODEL
	const userText = request.previousContext
		? `${request.prompt}\n\nPrevious analysis context:\n${request.previousContext}`
		: request.prompt

	const apiCallStart = Date.now()
	logger.info('Calling OpenRouter API', { model, images: request.images.length })

	try {
		const content = await chatCompletion({
			model,
			messages: [
				{
					role: 'user',
					content: [{ type: 'text', text: userText }, ...request.images],
				},
			],
			max_tokens: options.maxTokens ?? 2000,
			temperature: options.temperature ?? 0.2,
		})

		logApiCall('POST', '/chat/completions', 200, Date.now() - apiCallStart, {
			provider: 'openrouter',
			model,
			imageCount: request.images.length,
		})

		return content
	} catch (error) {
		logApiCall('POST', '/chat/completions', 500, Date.now() - apiCallStart, {
			provider: 'openrouter',
			model,
			error: error instanceof Error ? error.message : String(error),
		})
		throw new Error(`OpenRouter API call failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}
