import { describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
	app: { isPackaged: false, getPath: vi.fn(() => '/tmp/codelens-test-logs') },
}))

describe('logger console failure handling', () => {
	test('logging never throws when the console is broken (EPIPE)', async () => {
		const { createLogger } = await import('../../src/lib/logger')
		const logger = createLogger('epipe-test')
		const originalLog = console.log
		const originalError = console.error
		console.log = () => {
			throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
		}
		console.error = console.log
		try {
			expect(() => logger.info('first write hits the broken pipe')).not.toThrow()
			// Subsequent writes must stay safe after the console is disabled.
			expect(() => logger.error('second write after console failure')).not.toThrow()
		} finally {
			console.log = originalLog
			console.error = originalError
		}
	})
})
