import * as fs from 'node:fs'
import * as path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import type { App } from 'electron'
import type { Logger } from '../lib'

export function loadEnvironment(app: App, logger: Logger): void {
	// Order mirrors configStore.getConfigPath: the settings window writes to
	// userData when packaged and to the project directory when unpackaged.
	const envPaths = new Set(
		app.isPackaged
			? [path.join(app.getPath('userData'), '.env'), path.join(path.dirname(process.execPath), '.env')]
			: [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '..', '..', '.env')],
	)

	for (const envPath of envPaths) {
		if (fs.existsSync(envPath)) {
			loadDotenv({ path: envPath })
			logger.info('Loaded environment variables', { envPath })
			return
		}
	}

	logger.info('No .env file found, using system environment variables only', { searchedPaths: [...envPaths] })
}
