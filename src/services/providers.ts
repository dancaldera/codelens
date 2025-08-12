import { createLogger } from '../lib/logger'
import { isOpenAIConfigured } from './openai/client'
import { type AnalysisRequest, type AnalysisResponse, OpenAIService } from './openai/service'
import { isOpenRouterConfigured } from './openrouter/client'
import { OpenRouterService } from './openrouter/service'

const logger = createLogger('ProviderManager')

export type Provider = 'openai' | 'openrouter'

export interface ProviderConfig {
	name: Provider
	displayName: string
	isConfigured: () => boolean
	models: string[]
	defaultModel: string
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
	openai: {
		name: 'openai',
		displayName: 'OpenAI',
		isConfigured: isOpenAIConfigured,
		models: ['gpt-4o', 'gpt-4o-mini'],
		defaultModel: 'gpt-4o',
	},
	openrouter: {
		name: 'openrouter',
		displayName: 'OpenRouter',
		isConfigured: isOpenRouterConfigured,
		models: [
			'anthropic/claude-sonnet-4',
			'anthropic/claude-opus-4.1',
			'openai/gpt-4o',
			'openai/gpt-4o-mini',
			'x-ai/grok-4',
			'google/gemini-2.5-pro',
		],
		defaultModel: 'openai/gpt-4o',
	},
}

/**
 * Get the current provider based on environment configuration or override
 */
export function getCurrentProvider(override?: Provider): Provider {
	// Use override if provided and valid
	if (override && PROVIDERS[override]) {
		logger.debug('Using provider override', { provider: override })
		return override
	}

	// Check environment variable first
	const envProvider = process.env.AI_PROVIDER?.toLowerCase() as Provider
	if (envProvider && PROVIDERS[envProvider]) {
		logger.debug('Using provider from environment', { provider: envProvider })
		return envProvider
	}

	// Default to OpenAI if available, otherwise OpenRouter
	if (isOpenAIConfigured()) {
		logger.debug('Using OpenAI as default provider')
		return 'openai'
	}

	if (isOpenRouterConfigured()) {
		logger.debug('Using OpenRouter as fallback provider')
		return 'openrouter'
	}

	// Return OpenAI as final fallback (will show "no key" state)
	logger.debug('No provider configured, defaulting to OpenAI')
	return 'openai'
}

/**
 * Check if any provider is configured
 */
export function isAnyProviderConfigured(): boolean {
	return Object.values(PROVIDERS).some((provider) => provider.isConfigured())
}

/**
 * Get available models for the current provider
 */
export function getAvailableModels(providerOverride?: Provider): string[] {
	const provider = getCurrentProvider(providerOverride)
	return PROVIDERS[provider].models
}

/**
 * Get the default model for the current provider
 */
export function getDefaultModel(providerOverride?: Provider): string {
	const provider = getCurrentProvider(providerOverride)
	return PROVIDERS[provider].defaultModel
}

/**
 * Create the appropriate service instance based on provider and model
 */
export function createAnalysisService(model?: string, providerOverride?: Provider): OpenAIService | OpenRouterService {
	const provider = getCurrentProvider(providerOverride)
	const selectedModel = model || getDefaultModel(providerOverride)

	logger.debug('Creating analysis service', { provider, model: selectedModel })

	switch (provider) {
		case 'openai':
			return new OpenAIService({ model: selectedModel })
		case 'openrouter':
			return new OpenRouterService({ model: selectedModel })
		default:
			throw new Error(`Unknown provider: ${provider}`)
	}
}

/**
 * Analyze code using the specified provider
 */
export async function analyzeCodeWithProvider(
	request: AnalysisRequest,
	model?: string,
	providerOverride?: Provider,
): Promise<AnalysisResponse> {
	const service = createAnalysisService(model, providerOverride)
	return await service.analyzeCode(request)
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): Provider[] {
	return Object.keys(PROVIDERS) as Provider[]
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): Provider[] {
	return getAvailableProviders().filter((provider) => PROVIDERS[provider].isConfigured())
}

/**
 * Switch to the next available provider
 */
export function getNextProvider(currentProvider: Provider): Provider {
	const configuredProviders = getConfiguredProviders()

	// If no providers are configured, return the current one
	if (configuredProviders.length === 0) {
		return currentProvider
	}

	// If only one provider is configured, return it
	if (configuredProviders.length === 1) {
		return configuredProviders[0]
	}

	// Find the current provider index and switch to the next one
	const currentIndex = configuredProviders.indexOf(currentProvider)
	const nextIndex = (currentIndex + 1) % configuredProviders.length

	return configuredProviders[nextIndex]
}

/**
 * Get provider info for display
 */
export function getProviderInfo(providerOverride?: Provider): {
	provider: Provider
	displayName: string
	isConfigured: boolean
} {
	const provider = getCurrentProvider(providerOverride)
	const config = PROVIDERS[provider]

	return {
		provider,
		displayName: config.displayName,
		isConfigured: config.isConfigured(),
	}
}
