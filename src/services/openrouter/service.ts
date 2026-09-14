import { createLogger, logApiCall } from '../../lib/logger'
import { getProvider, type ProviderDef } from '../providers'
import { chatCompletion } from './client'

const logger = createLogger('AnalysisService')

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
	provider?: ProviderDef
}

export async function analyze(request: AnalysisRequest, options: AnalyzeOptions = {}): Promise<string> {
	const provider = options.provider ?? getProvider()
	const model = options.model ?? provider.defaultModel
	const userText = request.previousContext
		? `${request.prompt}\n\nPrevious analysis context:\n${request.previousContext}`
		: request.prompt

	const apiCallStart = Date.now()
	logger.info('Calling chat API', { provider: provider.id, model, images: request.images.length })

	try {
		const content = await chatCompletion(
			{
				model,
				messages: [
					{
						role: 'user',
						content: [{ type: 'text', text: userText }, ...request.images],
					},
				],
				// Reasoning models spend part of max_tokens on hidden reasoning before
				// emitting content, so the budget must cover both phases.
				max_tokens: options.maxTokens ?? 8000,
				temperature: options.temperature ?? 0.2,
			},
			provider,
		)

		logApiCall('POST', '/chat/completions', 200, Date.now() - apiCallStart, {
			provider: provider.id,
			model,
			imageCount: request.images.length,
		})

		return content
	} catch (error) {
		logApiCall('POST', '/chat/completions', 500, Date.now() - apiCallStart, {
			provider: provider.id,
			model,
			error: error instanceof Error ? error.message : String(error),
		})
		throw new Error(`${provider.label} API call failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}
