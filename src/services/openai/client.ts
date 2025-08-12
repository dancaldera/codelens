import { OpenAI } from 'openai'
import { createLogger } from '../../lib/logger'

const logger = createLogger('OpenAIClient')

/**
 * Check if OpenAI API key is configured and valid
 */
export function isOpenAIConfigured(): boolean {
	const hasKey = !!process.env.OPENAI_API_KEY
	const isValidFormat = process.env.OPENAI_API_KEY?.startsWith('sk-') ?? false

	logger.debug('API Key configuration check', { hasKey, isValidFormat })
	return hasKey && isValidFormat
}

/**
 * Create a configured OpenAI client instance
 */
export function createOpenAIClient(): OpenAI {
	if (!isOpenAIConfigured()) {
		throw new Error('OpenAI API key is not configured properly')
	}

	return new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
		timeout: 50000, // 50 second timeout for API calls
	})
}

/**
 * Validate OpenAI configuration and throw descriptive error if invalid
 */
export function validateOpenAIConfiguration(): void {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error('OpenAI API key not found. Please set OPENAI_API_KEY environment variable.')
	}

	if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
		throw new Error('Invalid OpenAI API key format. API key should start with "sk-".')
	}

	logger.debug('OpenAI configuration validated successfully')
}
