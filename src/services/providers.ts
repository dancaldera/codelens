import { createLogger } from '../lib/logger'
import {
	FALLBACK_PROGRAMMING_VISION_MODELS,
	fetchProgrammingModels,
	isOpenRouterConfigured,
	type ProgrammingModel,
} from './openrouter/client'

const logger = createLogger('ProviderManager')

// ponytail: single provider (OpenRouter). The 'provider' string still flows
// through the IPC contract + renderer badges as a display label; the
// multi-provider union/record/override machinery that lived here was removed.

let cachedModels: ProgrammingModel[] | null = null

export function isAnyProviderConfigured(): boolean {
	return isOpenRouterConfigured()
}

export async function getAvailableModels(): Promise<string[]> {
	if (cachedModels) return cachedModels.map((m) => m.id)

	try {
		cachedModels = await fetchProgrammingModels()
		return cachedModels.map((m) => m.id)
	} catch (error) {
		logger.error('Failed to fetch models, using fallback', { error })
		cachedModels = FALLBACK_PROGRAMMING_VISION_MODELS
		return cachedModels.map((m) => m.id)
	}
}
