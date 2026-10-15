import * as fs from 'node:fs'
import * as path from 'node:path'
import type { App } from 'electron'
import type { Logger } from '../lib'

export function loadEnvironment(app: App, logger: Logger): void {
	// Order mirrors configStore.getConfigPath: the settings window writes to
	// userData when packaged and to the project directory when unpackaged.
	const envPaths = new Set(
		app.isPackaged
			? [path.join(app.getPath('userData'), '.env'), path.join(path.dirname(process.execPath), '.env')]
			: [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '..', '.env')],
	)

	for (const envPath of envPaths) {
		if (!fs.existsSync(envPath)) continue
		try {
			// Built into Node >= 20.12 (Electron ships newer); never overrides
			// variables already present in the environment.
			process.loadEnvFile(envPath)
			logger.info('Loaded environment variables', { envPath })
			return
		} catch (error) {
			logger.warn('Failed to load .env file', { envPath, error })
		}
	}

	logger.info('No .env file found, using system environment variables only', { searchedPaths: [...envPaths] })
}
