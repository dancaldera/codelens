import { createLogger, logApiCall } from '../lib/logger'
import { DEFAULT_TRANSCRIPTION_MODEL, validateOpenRouterConfiguration } from './openrouter/client'

const logger = createLogger('SttService')

const OPENROUTER_STT_ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions'

export interface TranscribeAudioOptions {
	audioBase64: string
	mimeType: string
	model?: string
}

interface OpenRouterSttResponse {
	text?: string
	usage?: {
		seconds?: number
		total_tokens?: number
		input_tokens?: number
		output_tokens?: number
		cost?: number
	}
	error?: {
		message?: string
	}
}

export async function transcribeAudio({
	audioBase64,
	mimeType,
	model = DEFAULT_TRANSCRIPTION_MODEL,
}: TranscribeAudioOptions): Promise<string> {
	validateOpenRouterConfiguration()

	const apiCallStart = Date.now()
	const format = getAudioFormatFromMimeType(mimeType)
	logger.info('Calling OpenRouter STT API', { model, format })

	try {
		const response = await fetch(OPENROUTER_STT_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://codelens.app',
				'X-Title': process.env.OPENROUTER_SITE_NAME || 'CodeLens',
			},
			body: JSON.stringify({
				model,
				input_audio: {
					data: audioBase64,
					format,
				},
			}),
		})

		const result = (await response.json().catch(() => ({}))) as OpenRouterSttResponse
		const apiCallTime = Date.now() - apiCallStart
		logApiCall('POST', '/audio/transcriptions', response.status, apiCallTime, {
			provider: 'openrouter',
			model,
			format,
		})

		if (!response.ok) {
			throw new Error(result.error?.message || `OpenRouter STT API returned ${response.status}: ${response.statusText}`)
		}

		return (result.text ?? '').trim()
	} catch (error) {
		const apiCallTime = Date.now() - apiCallStart
		logApiCall('POST', '/audio/transcriptions', 500, apiCallTime, {
			provider: 'openrouter',
			model,
			format,
			error: error instanceof Error ? error.message : String(error),
		})
		throw new Error(`OpenRouter STT call failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}

export function getAudioFormatFromMimeType(mimeType: string): string {
	const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? ''

	switch (normalized) {
		case 'audio/aac':
			return 'aac'
		case 'audio/flac':
			return 'flac'
		case 'audio/m4a':
		case 'audio/mp4':
			return 'm4a'
		case 'audio/mp3':
		case 'audio/mpeg':
			return 'mp3'
		case 'audio/ogg':
			return 'ogg'
		case 'audio/wav':
			return 'wav'
		default:
			return 'webm'
	}
}
