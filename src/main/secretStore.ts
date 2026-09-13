import * as fs from 'node:fs'
import * as path from 'node:path'
import { type App, safeStorage } from 'electron'
import type { Logger } from '../lib'

// Secrets are encrypted via safeStorage — on macOS the encryption key lives in
// the login Keychain ("CodeLens Safe Storage"), on Windows DPAPI, on Linux
// libsecret/kwallet. Only ciphertext is persisted to userData.
const SECRETS_FILE = 'codelens-secrets.json'

export function isSecureStorageAvailable(): boolean {
	return safeStorage.isEncryptionAvailable()
}

function secretsPath(app: App): string {
	return path.join(app.getPath('userData'), SECRETS_FILE)
}

function readStore(app: App): Record<string, string> {
	try {
		return JSON.parse(fs.readFileSync(secretsPath(app), 'utf8')) as Record<string, string>
	} catch {
		return {}
	}
}

function writeStore(app: App, store: Record<string, string>): void {
	const filePath = secretsPath(app)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
}

export function saveSecret(app: App, name: string, value: string): void {
	const store = readStore(app)
	if (value) {
		store[name] = safeStorage.encryptString(value).toString('base64')
	} else {
		delete store[name]
	}
	writeStore(app, store)

	if (value) {
		process.env[name] = value
	} else {
		delete process.env[name]
	}
}

export function readSecrets(app: App, logger: Logger): Record<string, string> {
	const secrets: Record<string, string> = {}
	for (const [name, cipher] of Object.entries(readStore(app))) {
		try {
			secrets[name] = safeStorage.decryptString(Buffer.from(cipher, 'base64'))
		} catch (error) {
			logger.warn('Failed to decrypt stored secret', {
				name,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}
	return secrets
}

// Overlay saved secrets onto process.env after dotenv so keychain-stored
// credentials win over stale .env plaintext.
export function loadSecretsIntoEnv(app: App, logger: Logger): void {
	if (!isSecureStorageAvailable()) return

	const secrets = readSecrets(app, logger)
	for (const [name, value] of Object.entries(secrets)) {
		process.env[name] = value
	}
	if (Object.keys(secrets).length) {
		logger.info('Loaded secrets from secure storage', { count: Object.keys(secrets).length })
	}
}
