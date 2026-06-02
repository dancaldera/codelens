import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { App } from 'electron'

interface EnvLogger {
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
}

export async function loadEnvironment(app: App, logger: EnvLogger = console): Promise<void> {
	try {
		const dotenv = await import('dotenv')
		const appPath = app.isPackaged ? path.dirname(process.execPath) : process.cwd()
		const homePath = os.homedir()
		const envPaths = [
			path.join(appPath, '.env'),
			path.join(homePath, '.env'),
			path.join(process.cwd(), '.env'),
			path.join(__dirname, '..', '..', '..', '.env'),
		]

		for (const envPath of envPaths) {
			if (fs.existsSync(envPath)) {
				dotenv.config({ path: envPath })
				logger.info('Loaded environment variables', { envPath })
				return
			}
		}

		logger.info('No .env file found, using system environment variables only', { searchedPaths: envPaths })
	} catch (error) {
		logger.warn('dotenv loading failed', { error })
	}
}
