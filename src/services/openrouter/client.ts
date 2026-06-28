import { createLogger } from '../../lib/logger'

const logger = createLogger('OpenRouterClient')

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 50000

export const DEFAULT_PROGRAMMING_VISION_MODEL = 'anthropic/claude-sonnet-4.6'
export const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe'

/**
 * Preferred order for CodeLens screenshot analysis. The API result is still used as
 * the source of truth; this list only keeps the strongest/cost-effective vision
 * coding models near the front of the Cmd+M cycle.
 */
export const PREFERRED_PROGRAMMING_VISION_MODEL_IDS = [
	'anthropic/claude-sonnet-4.6',
	'google/gemini-3.5-flash',
	'openai/gpt-5.5',
	'google/gemini-3.1-pro-preview',
	'openai/gpt-5.4',
	'google/gemini-3-flash-preview',
	'anthropic/claude-opus-4.7',
	'anthropic/claude-opus-4.6',
	'moonshotai/kimi-k2.6',
	'mistralai/mistral-medium-3-5',
]

/**
 * Offline/failure fallback, refreshed from OpenRouter's programming category on 2026-05-26.
 */
export const FALLBACK_PROGRAMMING_VISION_MODELS: ProgrammingModel[] = [
	{ id: 'anthropic/claude-sonnet-4.6', name: 'Anthropic: Claude Sonnet 4.6', contextLength: 1000000 },
	{ id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', contextLength: 1048576 },
	{ id: 'openai/gpt-5.5', name: 'OpenAI: GPT-5.5', contextLength: 1050000 },
	{ id: 'google/gemini-3.1-pro-preview', name: 'Google: Gemini 3.1 Pro Preview', contextLength: 1048576 },
	{ id: 'openai/gpt-5.4', name: 'OpenAI: GPT-5.4', contextLength: 1050000 },
	{ id: 'google/gemini-3-flash-preview', name: 'Google: Gemini 3 Flash Preview', contextLength: 1048576 },
	{ id: 'anthropic/claude-opus-4.7', name: 'Anthropic: Claude Opus 4.7', contextLength: 1000000 },
	{ id: 'anthropic/claude-opus-4.6', name: 'Anthropic: Claude Opus 4.6', contextLength: 1000000 },
	{ id: 'moonshotai/kimi-k2.6', name: 'MoonshotAI: Kimi K2.6', contextLength: 262144 },
	{ id: 'mistralai/mistral-medium-3-5', name: 'Mistral: Mistral Medium 3.5', contextLength: 262144 },
]

export const FALLBACK_TRANSCRIPTION_MODELS: ProgrammingModel[] = [
	{ id: 'openai/gpt-4o-mini-transcribe', name: 'OpenAI: GPT-4o Mini Transcribe' },
	{ id: 'openai/gpt-4o-transcribe', name: 'OpenAI: GPT-4o Transcribe' },
	{ id: 'openai/whisper-1', name: 'OpenAI: Whisper' },
]

/**
 * OpenRouter model architecture information
 */
export interface ModelArchitecture {
	modality: string | null
	input_modalities: string[]
	output_modalities: string[]
	tokenizer?: string
	instruct_type?: string | null
}

/**
 * OpenRouter model data from API
 */
export interface OpenRouterModel {
	id: string
	name: string
	description?: string
	architecture: ModelArchitecture
	context_length: number | null
	created?: number
	pricing: {
		prompt: string
		completion: string
		[key: string]: string | number | undefined
	}
	supported_parameters?: string[]
}

/**
 * Simple model info used by the application
 */
export interface ProgrammingModel {
	id: string
	name: string
	contextLength?: number | null
	created?: number
	promptPrice?: string
	completionPrice?: string
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
 * Chat completion request shapes (subset of OpenRouter/OpenAI's API).
 */
export interface ChatCompletionMessage {
	role: string
	content: unknown[]
}

export interface ChatCompletionRequest {
	model: string
	messages: ChatCompletionMessage[]
	max_tokens: number
	temperature: number
}

interface ChatCompletionResponse {
	choices?: { message?: { content?: string } }[]
	error?: { message?: string }
}

/**
 * Send a chat completion request to OpenRouter and return the first choice's content.
 * Mirrors the stt.ts fetch pattern (same headers, AbortController timeout, error shape).
 */
export async function chatCompletion(body: ChatCompletionRequest): Promise<string> {
	validateOpenRouterConfiguration()

	const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
			'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})

	const result = (await response.json().catch(() => ({}))) as ChatCompletionResponse

	if (!response.ok) {
		throw new Error(result.error?.message || `OpenRouter API returned ${response.status}: ${response.statusText}`)
	}

	return result.choices?.[0]?.message?.content ?? ''
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
 * @returns Array of programming models with image support, ordered by CodeLens preference first
 */
export async function fetchProgrammingModels(): Promise<ProgrammingModel[]> {
	try {
		logger.debug('Fetching programming models from OpenRouter API')

		const url = new URL(OPENROUTER_MODELS_ENDPOINT)
		url.searchParams.set('category', 'programming')
		url.searchParams.set('output_modalities', 'text')

		const headers: Record<string, string> = {
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
			'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
		}

		if (process.env.OPENROUTER_API_KEY) {
			headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`
		}

		const response = await fetch(url, {
			method: 'GET',
			headers,
		})

		if (!response.ok) {
			throw new Error(`OpenRouter API returned ${response.status}: ${response.statusText}`)
		}

		const data = (await response.json()) as { data?: OpenRouterModel[] }

		const modelsWithImageSupport = orderProgrammingModels(
			(data.data ?? []).filter(isVisionTextModel).map((model) => ({
				id: model.id,
				name: model.name,
				contextLength: model.context_length,
				created: model.created,
				promptPrice: model.pricing.prompt,
				completionPrice: model.pricing.completion,
			})),
		)

		if (!modelsWithImageSupport.length) {
			logger.warn('OpenRouter returned no programming vision models; using fallback catalog')
			return FALLBACK_PROGRAMMING_VISION_MODELS
		}

		logger.debug(`Found ${modelsWithImageSupport.length} programming models with image support`)

		return modelsWithImageSupport
	} catch (error) {
		logger.error('Failed to fetch programming models from OpenRouter', { error })
		return FALLBACK_PROGRAMMING_VISION_MODELS
	}
}

export async function fetchTranscriptionModels(): Promise<ProgrammingModel[]> {
	try {
		logger.debug('Fetching transcription models from OpenRouter API')

		const url = new URL(OPENROUTER_MODELS_ENDPOINT)
		url.searchParams.set('output_modalities', 'transcription')

		const headers: Record<string, string> = {
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
			'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
		}

		if (process.env.OPENROUTER_API_KEY) {
			headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`
		}

		const response = await fetch(url, {
			method: 'GET',
			headers,
		})

		if (!response.ok) {
			throw new Error(`OpenRouter API returned ${response.status}: ${response.statusText}`)
		}

		const data = (await response.json()) as { data?: OpenRouterModel[] }
		const transcriptionModels = orderTranscriptionModels(
			(data.data ?? []).filter(isTranscriptionModel).map((model) => ({
				id: model.id,
				name: model.name,
				contextLength: model.context_length,
				created: model.created,
				promptPrice: model.pricing.prompt,
				completionPrice: model.pricing.completion,
			})),
		)

		if (!transcriptionModels.length) {
			logger.warn('OpenRouter returned no transcription models; using fallback catalog')
			return FALLBACK_TRANSCRIPTION_MODELS
		}

		logger.debug(`Found ${transcriptionModels.length} transcription models`)
		return transcriptionModels
	} catch (error) {
		logger.error('Failed to fetch transcription models from OpenRouter', { error })
		return FALLBACK_TRANSCRIPTION_MODELS
	}
}

function isVisionTextModel(model: OpenRouterModel): boolean {
	const inputModalities = model.architecture?.input_modalities ?? []
	const outputModalities = model.architecture?.output_modalities ?? []

	return inputModalities.includes('image') && outputModalities.includes('text')
}

function isTranscriptionModel(model: OpenRouterModel): boolean {
	const outputModalities = model.architecture?.output_modalities ?? []
	const id = model.id.toLowerCase()
	return outputModalities.includes('transcription') || id.includes('transcribe') || id.includes('whisper')
}

function orderProgrammingModels(models: ProgrammingModel[]): ProgrammingModel[] {
	const modelsById = new Map(models.map((model) => [model.id, model]))
	const preferredModels = PREFERRED_PROGRAMMING_VISION_MODEL_IDS.flatMap((id) => {
		const model = modelsById.get(id)
		return model ? [model] : []
	})
	const preferredIds = new Set(preferredModels.map((model) => model.id))
	const remainingModels = models.filter((model) => !preferredIds.has(model.id))

	return [...preferredModels, ...remainingModels]
}

function orderTranscriptionModels(models: ProgrammingModel[]): ProgrammingModel[] {
	return [...models].sort((a, b) => {
		if (a.id === DEFAULT_TRANSCRIPTION_MODEL) return -1
		if (b.id === DEFAULT_TRANSCRIPTION_MODEL) return 1
		return (b.created ?? 0) - (a.created ?? 0)
	})
}
