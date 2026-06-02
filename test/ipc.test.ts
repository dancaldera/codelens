import { describe, expect, test } from 'vitest'
import { isValidResizeWindowPayload, isValidScreenshotIndex, isValidVoiceAudioPayload } from '../src/ipc'

describe('IPC payload validation', () => {
	test('accepts bounded resize payloads', () => {
		expect(isValidResizeWindowPayload({ width: 800, height: 600 })).toBe(true)
	})

	test('rejects unsafe resize payloads', () => {
		expect(isValidResizeWindowPayload({ width: Number.NaN, height: 600 })).toBe(false)
		expect(isValidResizeWindowPayload({ width: 10_000, height: 600 })).toBe(false)
		expect(isValidResizeWindowPayload({ width: 800, height: '<script>' })).toBe(false)
	})

	test('validates screenshot indexes', () => {
		expect(isValidScreenshotIndex(1)).toBe(true)
		expect(isValidScreenshotIndex(2)).toBe(true)
		expect(isValidScreenshotIndex(0)).toBe(false)
		expect(isValidScreenshotIndex(3)).toBe(false)
	})

	test('validates voice audio payloads', () => {
		expect(isValidVoiceAudioPayload({ data: 'UklGRg==', mimeType: 'audio/webm', durationMs: 1000 })).toBe(true)
		expect(isValidVoiceAudioPayload({ data: 'UklGRg==', mimeType: 'text/plain', durationMs: 1000 })).toBe(false)
		expect(isValidVoiceAudioPayload({ data: 'not base64!', mimeType: 'audio/webm', durationMs: 1000 })).toBe(false)
		expect(isValidVoiceAudioPayload({ data: 'UklGRg==', mimeType: 'audio/webm', durationMs: 0 })).toBe(false)
	})
})
