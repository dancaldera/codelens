import { createLogger } from '../lib/logger'
import { fetchProgrammingModels, isOpenRouterConfigured, type ProgrammingModel } from './openrouter/client'
import {
	type AnalysisRequest,
	type AnalysisResponse,
	type GeneralAnalysisResponse,
	OpenRouterService,
} from './openrouter/service'

const logger = createLogger('ProviderManager')

// Cache for fetched models
let cachedModels: ProgrammingModel[] | null = null
let modelsFetchPromise: Promise<ProgrammingModel[]> | null = null

export type Provider = 'openrouter'

export interface ProviderConfig {
	name: Provider
	displayName: string
	isConfigured: () => boolean
	defaultModel: string
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
	openrouter: {
		name: 'openrouter',
		displayName: 'OpenRouter',
		isConfigured: isOpenRouterConfigured,
		defaultModel: 'anthropic/claude-sonnet-4.5',
	},
}

/**
 * Fallback models when API fetch fails
 */
const FALLBACK_MODELS: ProgrammingModel[] = [
	{ id: 'anthropic/claude-sonnet-4.5', name: 'Anthropic: Claude Sonnet 4.5' },
	{ id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
	{ id: 'openai/gpt-5', name: 'OpenAI: GPT-5' },
]

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
 * Get available models for the current provider (async with caching)
 * Fetches programming models with image support from OpenRouter API
 * Returns fallback models if API fetch fails
 */
export async function getAvailableModels(providerOverride?: Provider): Promise<string[]> {
	// Ensure provider is configured
	getCurrentProvider(providerOverride)

	// Return cached models if available
	if (cachedModels) {
		logger.debug('Returning cached models', { count: cachedModels.length })
		return cachedModels.map((m) => m.id)
	}

	// If a fetch is already in progress, wait for it
	if (modelsFetchPromise) {
		logger.debug('Waiting for in-progress model fetch')
		const models = await modelsFetchPromise
		return models.map((m) => m.id)
	}

	// Start new fetch
	logger.debug('Fetching programming models with image support')
	modelsFetchPromise = fetchProgrammingModels()

	try {
		const models = await modelsFetchPromise
		cachedModels = models
		modelsFetchPromise = null
		return models.map((m) => m.id)
	} catch (error) {
		logger.error('Failed to fetch models, using fallback', { error })
		modelsFetchPromise = null
		cachedModels = FALLBACK_MODELS
		return FALLBACK_MODELS.map((m) => m.id)
	}
}

/**
 * Get available models synchronously (returns cached or fallback)
 * Use this when you need models immediately without waiting for API
 */
export function getAvailableModelsSync(providerOverride?: Provider): string[] {
	// Ensure provider is configured
	getCurrentProvider(providerOverride)

	if (cachedModels) {
		return cachedModels.map((m) => m.id)
	}

	// Return fallback if no cache available
	return FALLBACK_MODELS.map((m) => m.id)
}

/**
 * Refresh the models cache by fetching latest from API
 */
export async function refreshModelsCache(): Promise<void> {
	logger.debug('Refreshing models cache')
	cachedModels = null
	modelsFetchPromise = null
	await getAvailableModels()
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
 * Analyze general content using the specified provider
 */
export async function analyzeGeneralWithProvider(
	request: AnalysisRequest,
	model?: string,
	providerOverride?: Provider,
): Promise<GeneralAnalysisResponse> {
	const service = createAnalysisService(model, providerOverride)
	return await service.analyzeGeneral(request)
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
