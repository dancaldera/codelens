import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchTranscriptionModels = vi.fn(async () => [
	{ id: 'openai/gpt-4o-mini-transcribe', name: 'OpenAI: GPT-4o Mini Transcribe' },
	{ id: 'openai/whisper-1', name: 'OpenAI: Whisper' },
])
const isOpenRouterConfigured = vi.fn(() => true)
const transcribeAudio = vi.fn(async () => 'Please solve this in TypeScript.')

vi.mock('../../src/services/openrouter/client', () => ({
	fetchTranscriptionModels: (...args: unknown[]) => fetchTranscriptionModels(...args),
	isOpenRouterConfigured: () => isOpenRouterConfigured(),
}))

vi.mock('../../src/services/stt', () => ({
	transcribeAudio: (...args: unknown[]) => transcribeAudio(...args),
}))

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

describe('VoiceSession', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test('loads OpenRouter STT models and exposes current model info', async () => {
		const send = vi.fn()
		const window = { webContents: { send } } as never
		const { VoiceSession } = await import('../../src/main/voiceSession')
		const session = new VoiceSession({ getWindow: () => window, logger })

		await session.initializeModels()

		expect(session.getCurrentModelInfo()).toEqual({
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini-transcribe',
			index: 0,
			count: 2,
		})
		expect(send).toHaveBeenCalledWith('stt-model-changed', {
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini-transcribe',
			index: 0,
			count: 2,
		})
	})

	test('stores latest transcript after handling recorded audio', async () => {
		const send = vi.fn()
		const window = { webContents: { send } } as never
		const { VoiceSession } = await import('../../src/main/voiceSession')
		const session = new VoiceSession({ getWindow: () => window, logger })

		await session.handleAudio({ data: 'UklGRg==', mimeType: 'audio/webm', durationMs: 1200 })

		expect(transcribeAudio).toHaveBeenCalledWith({
			audioBase64: 'UklGRg==',
			mimeType: 'audio/webm',
			model: 'openai/gpt-4o-mini-transcribe',
		})
		expect(session.getTranscript()).toBe('Please solve this in TypeScript.')
		expect(send).toHaveBeenCalledWith('voice-transcript-ready')
		expect(send).toHaveBeenCalledWith('voice-status', 'Ready')
	})

	test('cycles STT models like analysis model cycling', async () => {
		const send = vi.fn()
		const window = { webContents: { send } } as never
		const { VoiceSession } = await import('../../src/main/voiceSession')
		const session = new VoiceSession({ getWindow: () => window, logger })

		await session.initializeModels()
		session.switchModel()

		expect(session.getCurrentModelInfo()).toEqual({
			provider: 'openrouter',
			model: 'openai/whisper-1',
			index: 1,
			count: 2,
		})
		expect(send).toHaveBeenCalledWith('stt-model-changed', {
			provider: 'openrouter',
			model: 'openai/whisper-1',
			index: 1,
			count: 2,
		})
	})
})
