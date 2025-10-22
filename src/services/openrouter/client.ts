import { OpenAI } from 'openai'
import { createLogger } from '../../lib/logger'

const logger = createLogger('OpenRouterClient')

/**
 * OpenRouter model architecture information
 */
export interface ModelArchitecture {
	modality: string
	input_modalities: string[]
	output_modalities: string[]
	tokenizer: string
	instruct_type: string | null
}

/**
 * OpenRouter model data from API
 */
export interface OpenRouterModel {
	id: string
	name: string
	description: string
	architecture: ModelArchitecture
	context_length: number
	pricing: {
		prompt: string
		completion: string
	}
}

/**
 * Simple model info used by the application
 */
export interface ProgrammingModel {
	id: string
	name: string
}

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

/**
 * Fetch programming models that support image input from OpenRouter API
 * @returns Array of programming models with image support, ordered by name
 */
export async function fetchProgrammingModels(): Promise<ProgrammingModel[]> {
	try {
		logger.debug('Fetching programming models from OpenRouter API')

		const response = await fetch('https://openrouter.ai/api/v1/models?category=programming', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
				'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
			},
		})

		if (!response.ok) {
			throw new Error(`OpenRouter API returned ${response.status}: ${response.statusText}`)
		}

		const data = (await response.json()) as { data: OpenRouterModel[] }

		// Filter models that support image input and map to simple format
		const modelsWithImageSupport = data.data
			.filter((model) => model.architecture.input_modalities.includes('image'))
			.map((model) => ({
				id: model.id,
				name: model.name,
			}))

		logger.debug(`Found ${modelsWithImageSupport.length} programming models with image support`)

		return modelsWithImageSupport
	} catch (error) {
		logger.error('Failed to fetch programming models from OpenRouter', { error })
		// Return fallback models if API fails
		return [
			{ id: 'anthropic/claude-sonnet-4.5', name: 'Anthropic: Claude Sonnet 4.5' },
			{ id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
			{ id: 'openai/gpt-5', name: 'OpenAI: GPT-5' },
		]
	}
}
