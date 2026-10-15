import { createLogger } from '../../lib/logger'
import type { ProviderDef } from '../providers'

const logger = createLogger('OpenRouterClient')

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models'
const REQUEST_TIMEOUT_MS = 50000
const MODELS_REQUEST_TIMEOUT_MS = 15000

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
	/** Non-null when OpenRouter has scheduled the endpoint for shutdown. */
	expiration_date?: string | null
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

interface ChatContentPart {
	type?: string
	text?: string
}

interface ChatCompletionResponse {
	choices?: {
		message?: { content?: string | ChatContentPart[] | null }
		finish_reason?: string | null
	}[]
	error?: { message?: string; code?: number | string } | string
}

/**
 * Model catalog result. `error` is set when the live OpenRouter fetch failed and
 * `models` contains the built-in fallback catalog instead of live data.
 */
export interface ModelCatalog {
	models: ProgrammingModel[]
	error: string | null
}

/**
 * Shared provider request headers (auth + attribution + optional JSON body).
 */
export function providerHeaders(provider: ProviderDef, json = false): Record<string, string> {
	const headers: Record<string, string> = { ...provider.extraHeaders?.() }
	if (json) headers['Content-Type'] = 'application/json'
	const key = process.env[provider.envKey]
	if (key) headers.Authorization = `Bearer ${key}`
	return headers
}

/**
 * Send a chat completion request to the provider and return the first choice's content.
 * Mirrors the stt.ts fetch pattern (same headers, AbortController timeout, error shape).
 */
export async function chatCompletion(body: ChatCompletionRequest, provider: ProviderDef): Promise<string> {
	validateProviderConfiguration(provider)

	let response: Response
	try {
		response = await fetch(`${provider.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: providerHeaders(provider, true),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
	} catch (error) {
		throw new Error(`${provider.label} request failed: ${describeFetchError(error)}`)
	}

	const result = (await response.json().catch(() => ({}))) as ChatCompletionResponse
	const apiError = extractApiError(result.error)

	if (!response.ok) {
		throw new Error(apiError || `${provider.label} API returned ${response.status}: ${response.statusText}`)
	}

	// OpenRouter can answer 200 with an `error` payload when the upstream provider
	// fails mid-generation (rate limits, moderation, "no allowed providers").
	if (apiError) {
		throw new Error(apiError)
	}

	const choice = result.choices?.[0]
	const content = extractTextContent(choice?.message?.content)
	if (content) {
		return content
	}

	throw new Error(describeEmptyCompletion(provider, body.model, choice?.finish_reason))
}

interface ChatCompletionChunk {
	choices?: {
		delta?: { content?: string | ChatContentPart[] | null }
		finish_reason?: string | null
	}[]
	error?: ChatCompletionResponse['error']
}

/**
 * Streaming variant of chatCompletion: parses the provider's SSE stream,
 * forwards each text delta to onChunk, and resolves with the full text.
 */
export async function chatCompletionStream(
	body: ChatCompletionRequest,
	provider: ProviderDef,
	onChunk: (chunk: string) => void,
): Promise<string> {
	validateProviderConfiguration(provider)

	let response: Response
	try {
		response = await fetch(`${provider.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: providerHeaders(provider, true),
			body: JSON.stringify({ ...body, stream: true }),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
	} catch (error) {
		throw new Error(`${provider.label} request failed: ${describeFetchError(error)}`)
	}

	if (!response.ok || !response.body) {
		const result = (await response.json().catch(() => ({}))) as ChatCompletionResponse
		throw new Error(
			extractApiError(result.error) || `${provider.label} API returned ${response.status}: ${response.statusText}`,
		)
	}

	logger.debug('Streaming chat completion', { provider: provider.id, model: body.model })
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let content = ''
	let finishReason: string | null | undefined

	const handleLine = (line: string): void => {
		const data = line.startsWith('data:') ? line.slice(5).trim() : ''
		if (!data || data === '[DONE]') return
		let chunk: ChatCompletionChunk
		try {
			chunk = JSON.parse(data) as ChatCompletionChunk
		} catch {
			return
		}
		const apiError = extractApiError(chunk.error)
		if (apiError) throw new Error(apiError)
		const choice = chunk.choices?.[0]
		if (choice?.finish_reason) finishReason = choice.finish_reason
		const text = extractTextContent(choice?.delta?.content)
		if (text) {
			content += text
			onChunk(text)
		}
	}

	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split('\n')
		buffer = lines.pop() ?? ''
		for (const line of lines) handleLine(line)
	}
	if (buffer.trim()) handleLine(buffer)

	logger.debug('Streaming chat completion finished', {
		provider: provider.id,
		model: body.model,
		chars: content.length,
	})
	if (content) return content
	throw new Error(describeEmptyCompletion(provider, body.model, finishReason))
}

function extractApiError(error: ChatCompletionResponse['error']): string | null {
	if (!error) return null
	if (typeof error === 'string') return error
	if (typeof error.message === 'string' && error.message.trim()) return error.message
	if (error.code !== undefined) return `error code ${String(error.code)}`
	return 'unknown provider error'
}

function extractTextContent(content: string | ChatContentPart[] | null | undefined): string {
	if (typeof content === 'string') return content
	if (!Array.isArray(content)) return ''
	return content
		.filter((part) => part?.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text as string)
		.join('')
}

function describeEmptyCompletion(provider: ProviderDef, model: string, finishReason?: string | null): string {
	switch (finishReason) {
		case 'length':
			return `${model} hit the token limit before producing a response (common with reasoning models). Try again or switch model with Ctrl/Cmd+M.`
		case 'content_filter':
			return `${provider.label} blocked the response from ${model} (content filter).`
		case 'error':
			return `${provider.label} reported a generation error for ${model} without details.`
		default:
			return `${model} returned an empty response.`
	}
}

function describeFetchError(error: unknown): string {
	if (error instanceof Error) {
		if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'request timed out'
		return error.message
	}
	return String(error)
}

/**
 * Validate a provider's API key and throw descriptive error if invalid
 */
export function validateProviderConfiguration(provider: ProviderDef): void {
	const key = process.env[provider.envKey]
	if (!key) {
		throw new Error(`${provider.label} API key not found. Please set ${provider.envKey} environment variable.`)
	}

	if (!key.startsWith('sk-')) {
		throw new Error(`Invalid ${provider.label} API key format. API key should start with "sk-".`)
	}

	logger.debug('Provider configuration validated successfully', { provider: provider.id })
}

interface ModelQuery {
	params: Record<string, string>
	filter: (model: OpenRouterModel) => boolean
	order: (models: ProgrammingModel[]) => ProgrammingModel[]
	fallback: ProgrammingModel[]
	label: string
}

async function fetchModels({ params, filter, order, fallback, label }: ModelQuery): Promise<ModelCatalog> {
	try {
		logger.debug(`Fetching ${label} models from OpenRouter API`)

		const url = new URL(OPENROUTER_MODELS_ENDPOINT)
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value)
		}

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
			signal: AbortSignal.timeout(MODELS_REQUEST_TIMEOUT_MS),
		})
		if (!response.ok) {
			throw new Error(`OpenRouter API returned ${response.status}: ${response.statusText}`)
		}

		const data = (await response.json()) as { data?: OpenRouterModel[] }
		const models = order(
			(data.data ?? []).filter((model) => isActiveModel(model) && filter(model)).map(toProgrammingModel),
		)

		if (!models.length) {
			const message = `OpenRouter returned no ${label} models`
			logger.warn(`${message}; using fallback catalog`)
			return { models: fallback, error: message }
		}

		logger.debug(`Found ${models.length} ${label} models`)
		return { models, error: null }
	} catch (error) {
		const message = describeFetchError(error)
		logger.error(`Failed to fetch ${label} models from OpenRouter`, { error })
		return { models: fallback, error: message }
	}
}

function toProgrammingModel(model: OpenRouterModel): ProgrammingModel {
	return {
		id: model.id,
		name: model.name,
		contextLength: model.context_length,
		created: model.created,
		promptPrice: model.pricing.prompt,
		completionPrice: model.pricing.completion,
	}
}

/**
 * Fetch programming models that support image input from OpenRouter API
 * @returns Model catalog with live data, or the fallback catalog plus an error message
 */
export function fetchProgrammingModels(): Promise<ModelCatalog> {
	return fetchModels({
		params: { category: 'programming' },
		filter: isVisionTextModel,
		order: orderProgrammingModels,
		fallback: FALLBACK_PROGRAMMING_VISION_MODELS,
		label: 'programming vision',
	})
}

export function fetchTranscriptionModels(): Promise<ModelCatalog> {
	return fetchModels({
		params: {},
		filter: isTranscriptionModel,
		order: orderTranscriptionModels,
		fallback: FALLBACK_TRANSCRIPTION_MODELS,
		label: 'transcription',
	})
}

function isVisionTextModel(model: OpenRouterModel): boolean {
	const inputModalities = model.architecture?.input_modalities ?? []
	const outputModalities = model.architecture?.output_modalities ?? []

	// Requests always send a text prompt plus image content, so the model must
	// accept both modalities and answer with text.
	return inputModalities.includes('text') && inputModalities.includes('image') && outputModalities.includes('text')
}

function isActiveModel(model: OpenRouterModel): boolean {
	if (!model.expiration_date) return true
	const expiresAt = Date.parse(model.expiration_date)
	return Number.isNaN(expiresAt) || expiresAt > Date.now()
}

function isTranscriptionModel(model: OpenRouterModel): boolean {
	const outputModalities = model.architecture?.output_modalities ?? []
	const id = model.id.toLowerCase()
	return outputModalities.includes('transcription') || id.includes('transcribe') || id.includes('whisper')
}

function orderProgrammingModels(models: ProgrammingModel[]): ProgrammingModel[] {
	// The live catalog can omit our preferred models (the programming category
	// is not exhaustive), which silently made the newest preview model the
	// default. Seed the list from the curated fallback entries so the proven
	// models always lead the cycle; live API data refreshes their metadata.
	const modelsById = new Map(models.map((model) => [model.id, model]))
	for (const fallback of FALLBACK_PROGRAMMING_VISION_MODELS) {
		if (!modelsById.has(fallback.id)) modelsById.set(fallback.id, fallback)
	}
	const preferredModels = PREFERRED_PROGRAMMING_VISION_MODEL_IDS.flatMap((id) => {
		const model = modelsById.get(id)
		return model ? [model] : []
	})
	const preferredIds = new Set(preferredModels.map((model) => model.id))
	const remainingModels = [...modelsById.values()]
		.filter((model) => !preferredIds.has(model.id))
		.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))

	return [...preferredModels, ...remainingModels]
}

function orderTranscriptionModels(models: ProgrammingModel[]): ProgrammingModel[] {
	return [...models].sort((a, b) => {
		if (a.id === DEFAULT_TRANSCRIPTION_MODEL) return -1
		if (b.id === DEFAULT_TRANSCRIPTION_MODEL) return 1
		return (b.created ?? 0) - (a.created ?? 0)
	})
}
