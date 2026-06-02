import { describe, expect, test } from 'vitest'
import { isValidResizeWindowPayload, isValidScreenshotIndex } from '../src/ipc'

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
})
