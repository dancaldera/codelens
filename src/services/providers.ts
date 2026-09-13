import { createLogger } from '../lib/logger'
import {
	FALLBACK_PROGRAMMING_VISION_MODELS,
	FALLBACK_TRANSCRIPTION_MODELS,
	fetchProgrammingModels,
	fetchTranscriptionModels,
	type ProgrammingModel,
} from './openrouter/client'

const logger = createLogger('ProviderManager')

export type TranscriptionMode = 'json' | 'multipart'

export interface ProviderDef {
	id: string
	label: string
	envKey: string
	baseUrl: string
	vision: boolean
	transcription: TranscriptionMode | null
	defaultModel: string
	models: ProgrammingModel[] | null
	transcriptionModels: ProgrammingModel[]
	defaultTranscriptionModel: string | null
	extraHeaders?: () => Record<string, string>
}

const OPENAI_VISION_MODELS: ProgrammingModel[] = [
	{ id: 'gpt-5.5', name: 'OpenAI: GPT-5.5' },
	{ id: 'gpt-5.4', name: 'OpenAI: GPT-5.4' },
	{ id: 'gpt-5', name: 'OpenAI: GPT-5' },
	{ id: 'gpt-4.1', name: 'OpenAI: GPT-4.1' },
	{ id: 'gpt-4o', name: 'OpenAI: GPT-4o' },
	{ id: 'gpt-4o-mini', name: 'OpenAI: GPT-4o Mini' },
]

const OPENAI_TRANSCRIPTION_MODELS: ProgrammingModel[] = [
	{ id: 'gpt-4o-mini-transcribe', name: 'OpenAI: GPT-4o Mini Transcribe' },
	{ id: 'gpt-4o-transcribe', name: 'OpenAI: GPT-4o Transcribe' },
	{ id: 'whisper-1', name: 'OpenAI: Whisper' },
]

const DEEPSEEK_MODELS: ProgrammingModel[] = [
	{ id: 'deepseek-chat', name: 'DeepSeek: Chat' },
	{ id: 'deepseek-reasoner', name: 'DeepSeek: Reasoner' },
]

export type ProviderId = 'openrouter' | 'openai' | 'deepseek'

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
	openrouter: {
		id: 'openrouter',
		label: 'OpenRouter',
		envKey: 'OPENROUTER_API_KEY',
		baseUrl: 'https://openrouter.ai/api/v1',
		vision: true,
		transcription: 'json',
		defaultModel: 'anthropic/claude-sonnet-4.6',
		models: null,
		transcriptionModels: FALLBACK_TRANSCRIPTION_MODELS,
		defaultTranscriptionModel: 'openai/gpt-4o-mini-transcribe',
		extraHeaders: () => ({
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
			'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
		}),
	},
	openai: {
		id: 'openai',
		label: 'OpenAI',
		envKey: 'OPENAI_API_KEY',
		baseUrl: 'https://api.openai.com/v1',
		vision: true,
		transcription: 'multipart',
		defaultModel: 'gpt-4o',
		models: OPENAI_VISION_MODELS,
		transcriptionModels: OPENAI_TRANSCRIPTION_MODELS,
		defaultTranscriptionModel: 'gpt-4o-mini-transcribe',
	},
	deepseek: {
		id: 'deepseek',
		label: 'DeepSeek',
		envKey: 'DEEPSEEK_API_KEY',
		baseUrl: 'https://api.deepseek.com/v1',
		vision: false,
		transcription: null,
		defaultModel: 'deepseek-chat',
		models: DEEPSEEK_MODELS,
		transcriptionModels: [],
		defaultTranscriptionModel: null,
	},
}

export function listProviders(): ProviderDef[] {
	return Object.values(PROVIDERS)
}

export function getProvider(id?: string): ProviderDef {
	const requested = id ?? process.env.CODELENS_PROVIDER ?? 'openrouter'
	return (PROVIDERS as Record<string, ProviderDef>)[requested] ?? PROVIDERS.openrouter
}

export function isProviderConfigured(id?: string): boolean {
	const provider = getProvider(id)
	const key = process.env[provider.envKey]
	const configured = !!key && key.startsWith('sk-')
	logger.debug('Provider configuration check', { provider: provider.id, configured })
	return configured
}

const modelCache = new Map<string, ProgrammingModel[]>()

export function clearModelCache(id?: string): void {
	if (id) {
		modelCache.delete(id)
	} else {
		modelCache.clear()
	}
}

export async function getAvailableModels(provider: ProviderDef): Promise<string[]> {
	const cached = modelCache.get(provider.id)
	if (cached) return cached.map((m) => m.id)

	let models: ProgrammingModel[]
	if (provider.id === 'openrouter') {
		try {
			models = await fetchProgrammingModels()
		} catch (error) {
			logger.error('Failed to fetch models, using fallback', { error })
			models = FALLBACK_PROGRAMMING_VISION_MODELS
		}
	} else {
		models = provider.models ?? []
	}

	modelCache.set(provider.id, models)
	return models.map((m) => m.id)
}

export async function getAvailableTranscriptionModels(provider: ProviderDef): Promise<string[]> {
	if (!provider.transcription) return []

	if (provider.id === 'openrouter') {
		try {
			const models = await fetchTranscriptionModels()
			if (models.length) return models.map((m) => m.id)
		} catch (error) {
			logger.error('Failed to fetch transcription models, using fallback', { error })
		}
	}

	return provider.transcriptionModels.map((m) => m.id)
}
