import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

describe('STT service', () => {
	const originalOpenRouterKey = process.env.OPENROUTER_API_KEY

	beforeEach(() => {
		process.env.OPENROUTER_API_KEY = 'sk-test-key'
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					text: 'Use a dynamic programming approach.',
					usage: { seconds: 1.5, total_tokens: 10 },
				}),
			),
		)
	})

	afterEach(() => {
		process.env.OPENROUTER_API_KEY = originalOpenRouterKey
		vi.unstubAllGlobals()
		vi.clearAllMocks()
	})

	test('transcribes webm audio through OpenRouter only', async () => {
		const { transcribeAudio } = await import('../../src/services/stt')

		const transcript = await transcribeAudio({
			audioBase64: 'UklGRg==',
			mimeType: 'audio/webm;codecs=opus',
			model: 'openai/gpt-4o-mini-transcribe',
		})

		expect(transcript).toBe('Use a dynamic programming approach.')
		expect(fetch).toHaveBeenCalledWith(
			'https://openrouter.ai/api/v1/audio/transcriptions',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ Authorization: 'Bearer sk-test-key' }),
				body: expect.stringContaining('openai/gpt-4o-mini-transcribe'),
			}),
		)
		expect(JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({
			model: 'openai/gpt-4o-mini-transcribe',
			input_audio: {
				data: 'UklGRg==',
				format: 'webm',
			},
		})
	})

	test('maps common audio MIME types to OpenRouter formats', async () => {
		const { getAudioFormatFromMimeType } = await import('../../src/services/stt')

		expect(getAudioFormatFromMimeType('audio/webm;codecs=opus')).toBe('webm')
		expect(getAudioFormatFromMimeType('audio/mp4')).toBe('m4a')
		expect(getAudioFormatFromMimeType('audio/mpeg')).toBe('mp3')
		expect(getAudioFormatFromMimeType('audio/wav')).toBe('wav')
	})
})
