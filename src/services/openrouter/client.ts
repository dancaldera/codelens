import { OpenAI } from 'openai'
import { createLogger } from '../../lib/logger'

const logger = createLogger('OpenRouterClient')

/**
 * Check if OpenRouter API key is configured and valid
 */
export function isOpenRouterConfigured(): boolean {
	const hasKey = !!process.env.OPENROUTER_API_KEY
	const isValidFormat = process.env.OPENROUTER_API_KEY?.startsWith('sk-') ?? false

	logger.debug('OpenRouter API Key configuration check', { hasKey, isValidFormat })
	return hasKey && isValidFormat
}

/**
 * Create a configured OpenRouter client instance
 */
export function createOpenRouterClient(): OpenAI {
	if (!isOpenRouterConfigured()) {
		throw new Error('OpenRouter API key is not configured properly')
	}

	return new OpenAI({
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey: process.env.OPENROUTER_API_KEY,
		timeout: 50000, // 50 second timeout for API calls
		defaultHeaders: {
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
			'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
		},
	})
}

/**
 * Validate OpenRouter configuration and throw descriptive error if invalid
 */
export function validateOpenRouterConfiguration(): void {
	if (!process.env.OPENROUTER_API_KEY) {
		throw new Error('OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.')
	}

	if (!process.env.OPENROUTER_API_KEY.startsWith('sk-')) {
		throw new Error('Invalid OpenRouter API key format. API key should start with "sk-".')
	}

	logger.debug('OpenRouter configuration validated successfully')
}
