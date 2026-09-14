import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

const openRouterProvider = {
	id: 'openrouter',
	label: 'OpenRouter',
	envKey: 'OPENROUTER_API_KEY',
	baseUrl: 'https://openrouter.ai/api/v1',
	vision: true,
	transcription: 'json' as const,
	defaultModel: 'anthropic/claude-sonnet-4.6',
	models: null,
	transcriptionModels: [],
	defaultTranscriptionModel: null,
}

describe('Provider configuration guards', () => {
	let originalApiKey: string | undefined

	beforeEach(() => {
		originalApiKey = process.env.OPENROUTER_API_KEY
	})

	afterEach(() => {
		if (originalApiKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalApiKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
	})

	test('isProviderConfigured reflects key presence and format', async () => {
		const { isProviderConfigured } = await import('../../../src/services/providers')
		delete process.env.OPENROUTER_API_KEY
		expect(isProviderConfigured('openrouter')).toBe(false)
		process.env.OPENROUTER_API_KEY = 'sk-test123'
		expect(isProviderConfigured('openrouter')).toBe(true)
	})

	test('validateProviderConfiguration throws with a useful message when unset', async () => {
		const { validateProviderConfiguration } = await import('../../../src/services/openrouter/client')
		delete process.env.OPENROUTER_API_KEY
		expect(() => validateProviderConfiguration(openRouterProvider)).toThrow(/OpenRouter API key not found/)
	})
})

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		statusText: init.statusText ?? 'OK',
		json: () => Promise.resolve(body),
	}
}

describe('chatCompletion', () => {
	const realFetch = global.fetch

	beforeEach(() => {
		process.env.OPENROUTER_API_KEY = 'sk-test123'
	})

	afterEach(() => {
		global.fetch = realFetch
	})

	const request = {
		model: 'anthropic/claude-sonnet-4.6',
		messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
		max_tokens: 8000,
		temperature: 0.2,
	}

	test('returns string content from the first choice', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({ choices: [{ message: { content: 'analysis' }, finish_reason: 'stop' }] }),
		) as never

		const { chatCompletion } = await import('../../../src/services/openrouter/client')
		await expect(chatCompletion(request, openRouterProvider)).resolves.toBe('analysis')
	})

	test('joins array content parts into text', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({
				choices: [
					{
						message: {
							content: [
								{ type: 'text', text: 'part one. ' },
								{ type: 'text', text: 'part two.' },
							],
						},
						finish_reason: 'stop',
					},
				],
			}),
		) as never

		const { chatCompletion } = await import('../../../src/services/openrouter/client')
		await expect(chatCompletion(request, openRouterProvider)).resolves.toBe('part one. part two.')
	})

	test('throws the embedded error when the API returns 200 with an error payload', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({ error: { message: 'No allowed providers are available for this model' } }),
		) as never

		const { chatCompletion } = await import('../../../src/services/openrouter/client')
		await expect(chatCompletion(request, openRouterProvider)).rejects.toThrow(
			'No allowed providers are available for this model',
		)
	})

	test('explains token-limit exhaustion when finish_reason is length', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
		) as never

		const { chatCompletion } = await import('../../../src/services/openrouter/client')
		await expect(chatCompletion(request, openRouterProvider)).rejects.toThrow(/token limit/)
	})

	test('surfaces the provider error message on non-OK responses', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({ error: { message: 'Insufficient credits' } }, { ok: false, status: 402, statusText: 'Payment Required' }),
		) as never

		const { chatCompletion } = await import('../../../src/services/openrouter/client')
		await expect(chatCompletion(request, openRouterProvider)).rejects.toThrow('Insufficient credits')
	})
})

describe('fetchProgrammingModels', () => {
	const realFetch = global.fetch

	afterEach(() => {
		global.fetch = realFetch
	})

	test('keeps only live models that accept text+image and output text', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({
				data: [
					{
						id: 'vendor/vision-ok',
						name: 'Vision OK',
						architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
						context_length: 128000,
						created: 100,
						pricing: { prompt: '0', completion: '0' },
					},
					{
						id: 'vendor/image-only-input',
						name: 'No text input',
						architecture: { input_modalities: ['image'], output_modalities: ['text'] },
						context_length: 128000,
						created: 300,
						pricing: { prompt: '0', completion: '0' },
					},
					{
						id: 'vendor/expired',
						name: 'Expired',
						architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
						context_length: 128000,
						created: 200,
						expiration_date: '2000-01-01',
						pricing: { prompt: '0', completion: '0' },
					},
					{
						id: 'vendor/newer-vision',
						name: 'Newer Vision',
						architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
						context_length: 128000,
						created: 400,
						pricing: { prompt: '0', completion: '0' },
					},
				],
			}),
		) as never

		const { fetchProgrammingModels } = await import('../../../src/services/openrouter/client')
		const { models, error } = await fetchProgrammingModels()

		expect(error).toBeNull()
		const ids = models.map((model) => model.id)
		expect(ids).toEqual(expect.arrayContaining(['vendor/vision-ok', 'vendor/newer-vision']))
		expect(ids).not.toContain('vendor/image-only-input')
		expect(ids).not.toContain('vendor/expired')
		// Non-preferred remainder is ordered newest-first
		expect(ids.indexOf('vendor/newer-vision')).toBeLessThan(ids.indexOf('vendor/vision-ok'))
	})

	test('returns the fallback catalog with an error when the API fails', async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse({}, { ok: false, status: 401, statusText: 'Unauthorized' }),
		) as never

		const { fetchProgrammingModels, FALLBACK_PROGRAMMING_VISION_MODELS } = await import(
			'../../../src/services/openrouter/client'
		)
		const { models, error } = await fetchProgrammingModels()

		expect(models).toEqual(FALLBACK_PROGRAMMING_VISION_MODELS)
		expect(error).toContain('401')
	})
})
