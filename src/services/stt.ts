import { createLogger, logApiCall } from '../lib/logger'
import { providerHeaders, validateProviderConfiguration } from './openrouter/client'
import type { ProviderDef } from './providers'

const logger = createLogger('SttService')

export interface TranscribeAudioOptions {
	audioBase64: string
	mimeType: string
	model?: string
	provider: ProviderDef
}

interface SttResponse {
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
	model,
	provider,
}: TranscribeAudioOptions): Promise<string> {
	if (!provider.transcription) {
		throw new Error(`${provider.label} does not support audio transcription`)
	}

	validateProviderConfiguration(provider)

	const resolvedModel = model ?? provider.defaultTranscriptionModel ?? 'whisper-1'
	const format = getAudioFormatFromMimeType(mimeType)
	const endpoint = `${provider.baseUrl}/audio/transcriptions`
	const apiCallStart = Date.now()
	logger.info('Calling provider STT API', { provider: provider.id, model: resolvedModel, format })

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: providerHeaders(provider, provider.transcription === 'json'),
			body:
				provider.transcription === 'json'
					? JSON.stringify({ model: resolvedModel, input_audio: { data: audioBase64, format } })
					: buildMultipartBody(audioBase64, mimeType, format, resolvedModel),
		})

		const result = (await response.json().catch(() => ({}))) as SttResponse
		const apiCallTime = Date.now() - apiCallStart
		logApiCall('POST', '/audio/transcriptions', response.status, apiCallTime, {
			provider: provider.id,
			model: resolvedModel,
			format,
		})

		if (!response.ok) {
			throw new Error(
				result.error?.message || `${provider.label} STT API returned ${response.status}: ${response.statusText}`,
			)
		}

		return (result.text ?? '').trim()
	} catch (error) {
		logApiCall('POST', '/audio/transcriptions', 500, Date.now() - apiCallStart, {
			provider: provider.id,
			model: resolvedModel,
			format,
			error: error instanceof Error ? error.message : String(error),
		})
		throw new Error(`${provider.label} STT call failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}

function buildMultipartBody(audioBase64: string, mimeType: string, format: string, model: string): FormData {
	const bytes = Buffer.from(audioBase64, 'base64')
	const form = new FormData()
	form.append('file', new Blob([bytes], { type: mimeType }), `audio.${format}`)
	form.append('model', model)
	return form
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
