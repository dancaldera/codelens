import * as fs from 'node:fs'
import * as path from 'node:path'
import type { App } from 'electron'
import type { SaveSettingsPayload, SettingsConfig } from '../ipc'
import type { Logger } from '../lib'
import { isProviderConfigured, listProviders } from '../services/providers'
import { isSecureStorageAvailable, saveSecret } from './secretStore'

export function getConfigPath(app: App): string {
	return path.join(app.isPackaged ? app.getPath('userData') : process.cwd(), '.env')
}

export function readSettingsConfig(): SettingsConfig {
	return {
		provider: process.env.CODELENS_PROVIDER ?? 'openrouter',
		secureStorage: isSecureStorageAvailable(),
		providers: listProviders().map((provider) => ({
			id: provider.id,
			label: provider.label,
			envKey: provider.envKey,
			vision: provider.vision,
			transcription: provider.transcription !== null,
			configured: isProviderConfigured(provider.id),
		})),
		keys: Object.fromEntries(listProviders().map((provider) => [provider.envKey, process.env[provider.envKey] ?? ''])),
	}
}

export function saveSettingsConfig(app: App, payload: SaveSettingsPayload, logger: Logger): void {
	const configPath = getConfigPath(app)
	const secure = isSecureStorageAvailable()
	const entries: Record<string, string> = { CODELENS_PROVIDER: payload.provider }
	const securedKeys = new Set<string>()

	for (const key of payload.keys) {
		if (secure) {
			saveSecret(app, key.envKey, key.value)
			securedKeys.add(key.envKey)
		} else {
			entries[key.envKey] = key.value
		}
	}

	if (!secure && payload.keys.length) {
		logger.warn('OS secure storage unavailable; API keys saved to .env in plaintext')
	}

	const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : ''
	fs.mkdirSync(path.dirname(configPath), { recursive: true })
	fs.writeFileSync(configPath, upsertEnv(existing, entries, securedKeys), 'utf8')

	for (const [name, value] of Object.entries(entries)) {
		if (value) {
			process.env[name] = value
		} else {
			delete process.env[name]
		}
	}

	logger.info('Settings saved', { configPath, provider: payload.provider, secure })
}

// Updates KEY=value lines in place; appends unknown keys; drops lines whose key
// is in `remove` (e.g. secrets moved to OS keychain). Comments, ordering, and
// unrelated entries are preserved.
export function upsertEnv(content: string, entries: Record<string, string>, remove = new Set<string>()): string {
	const seen = new Set<string>()
	const lines = content
		.split('\n')
		.map((line) => {
			const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]
			if (key && key in entries) {
				seen.add(key)
				return `${key}=${entries[key]}`
			}
			return line
		})
		.filter((line) => {
			const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]
			return !key || !remove.has(key)
		})

	// A file ending in '\n' leaves a trailing empty element; drop it so appended
	// keys don't land after a blank line, then restore the trailing newline.
	const trailingNewline = lines[lines.length - 1] === ''
	if (trailingNewline) lines.pop()

	for (const [name, value] of Object.entries(entries)) {
		if (!seen.has(name)) {
			lines.push(`${name}=${value}`)
		}
	}

	return lines.join('\n') + (trailingNewline ? '\n' : '')
}
