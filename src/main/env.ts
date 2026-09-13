import * as fs from 'node:fs'
import * as path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import type { App } from 'electron'
import type { Logger } from '../lib'

export function loadEnvironment(app: App, logger: Logger): void {
	const envPaths = new Set([
		path.join(app.isPackaged ? path.dirname(process.execPath) : process.cwd(), '.env'),
		path.join(process.cwd(), '.env'),
		path.join(__dirname, '..', '..', '..', '.env'),
	])

	for (const envPath of envPaths) {
		if (fs.existsSync(envPath)) {
			loadDotenv({ path: envPath })
			logger.info('Loaded environment variables', { envPath })
			return
		}
	}

	logger.info('No .env file found, using system environment variables only', { searchedPaths: [...envPaths] })
}
