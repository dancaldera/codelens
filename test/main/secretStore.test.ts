import * as fs from 'node:fs'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const TEST_DIR = '/tmp/codelens-secret-store-test'

vi.mock('electron', () => ({
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: (value: string) => Buffer.from(`enc(${value})`),
		decryptString: (buffer: Buffer) => {
			const text = buffer.toString()
			if (!/^enc\(.*\)$/.test(text)) throw new Error('decryption failed')
			return text.replace(/^enc\(|\)$/g, '')
		},
	},
}))

import { loadSecretsIntoEnv, readSecrets, saveSecret } from '../../src/main/secretStore'

const fakeApp = { getPath: () => TEST_DIR } as any
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('secretStore', () => {
	beforeEach(() => {
		fs.rmSync(TEST_DIR, { recursive: true, force: true })
		delete process.env.TEST_API_KEY
	})

	test('saveSecret encrypts to disk and sets process.env', () => {
		saveSecret(fakeApp, 'TEST_API_KEY', 'sk-secret')

		const raw = fs.readFileSync(`${TEST_DIR}/codelens-secrets.json`, 'utf8')
		expect(raw).not.toContain('sk-secret')
		expect(process.env.TEST_API_KEY).toBe('sk-secret')
	})

	test('readSecrets decrypts stored values', () => {
		saveSecret(fakeApp, 'TEST_API_KEY', 'sk-roundtrip')

		expect(readSecrets(fakeApp, logger)).toEqual({ TEST_API_KEY: 'sk-roundtrip' })
	})

	test('saveSecret with empty value removes the entry and env var', () => {
		saveSecret(fakeApp, 'TEST_API_KEY', 'sk-secret')
		saveSecret(fakeApp, 'TEST_API_KEY', '')

		expect(readSecrets(fakeApp, logger)).toEqual({})
		expect(process.env.TEST_API_KEY).toBeUndefined()
	})

	test('loadSecretsIntoEnv overlays decrypted values onto process.env', () => {
		saveSecret(fakeApp, 'TEST_API_KEY', 'sk-from-keychain')
		delete process.env.TEST_API_KEY

		loadSecretsIntoEnv(fakeApp, logger)

		expect(process.env.TEST_API_KEY).toBe('sk-from-keychain')
	})

	test('readSecrets skips undecryptable entries', () => {
		saveSecret(fakeApp, 'TEST_API_KEY', 'sk-good')
		const file = `${TEST_DIR}/codelens-secrets.json`
		const store = JSON.parse(fs.readFileSync(file, 'utf8'))
		store.CORRUPT_KEY = '!!!not-base64!!!'
		fs.writeFileSync(file, JSON.stringify(store))

		expect(readSecrets(fakeApp, logger)).toEqual({ TEST_API_KEY: 'sk-good' })
		expect(logger.warn).toHaveBeenCalled()
	})
})
