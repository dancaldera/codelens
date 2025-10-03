import { createLogger } from '../lib/logger'
import { isOpenRouterConfigured } from './openrouter/client'
import { type AnalysisRequest, type AnalysisResponse, OpenRouterService } from './openrouter/service'

const logger = createLogger('ProviderManager')

export type Provider = 'openrouter'

export interface ProviderConfig {
	name: Provider
	displayName: string
	isConfigured: () => boolean
	models: string[]
	defaultModel: string
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
	openrouter: {
		name: 'openrouter',
		displayName: 'OpenRouter',
		isConfigured: isOpenRouterConfigured,
		models: ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'],
		defaultModel: 'anthropic/claude-sonnet-4.5',
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

	// Always return OpenRouter
	logger.debug('Using OpenRouter as provider')
	return 'openrouter'
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
export function createAnalysisService(model?: string, providerOverride?: Provider): OpenRouterService {
	const provider = getCurrentProvider(providerOverride)
	const selectedModel = model || getDefaultModel(providerOverride)

	logger.debug('Creating analysis service', { provider, model: selectedModel })

	return new OpenRouterService({ model: selectedModel })
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
