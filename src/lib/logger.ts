import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Zero-dependency logger: formatted console output plus JSON lines appended
// to app.log (rotated once at startup past 5 MB). Replaces winston.

export interface Logger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
type Level = keyof typeof LEVELS

const minLevel: Level = process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development' ? 'debug' : 'info'

let fileStream: fs.WriteStream | null = null
try {
	const logsDir = app.isPackaged ? path.join(app.getPath('userData'), 'logs') : path.join(process.cwd(), 'logs')
	fs.mkdirSync(logsDir, { recursive: true })
	const logPath = path.join(logsDir, 'app.log')
	if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5_242_880) {
		fs.renameSync(logPath, `${logPath}.1`)
	}
	fileStream = fs.createWriteStream(logPath, { flags: 'a' })
	fileStream.on('error', () => {
		fileStream = null
	})
} catch {
	fileStream = null
}

function serializeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!meta) return undefined
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(meta)) {
		out[key] = value instanceof Error ? { message: value.message, stack: value.stack } : value
	}
	return out
}

// A broken stdout/stderr pipe (e.g. launched through `| head`) must never
// take the logger down: swallow EPIPE from the process streams, disable
// console output for good, and keep file logging. Without the stream error
// listeners, Node escalates EPIPE to uncaughtException, whose handler would
// log to the same broken console and recurse without bound.
let consoleBroken = false
for (const stream of [process.stdout, process.stderr]) {
	stream?.on?.('error', () => {
		consoleBroken = true
	})
}

function writeToConsole(level: Level, line: string): void {
	if (consoleBroken) return
	try {
		if (level === 'error') console.error(line)
		else if (level === 'warn') console.warn(line)
		else console.log(line)
	} catch {
		consoleBroken = true
	}
}

function writeToFile(entry: Record<string, unknown>): void {
	try {
		fileStream?.write(`${JSON.stringify(entry)}\n`)
	} catch {
		fileStream = null
	}
}

function write(service: string, level: Level, message: string, meta?: Record<string, unknown>): void {
	if (LEVELS[level] < LEVELS[minLevel]) return
	const timestamp = new Date().toISOString()
	const data = serializeMeta(meta)
	const metaStr = data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''
	writeToConsole(level, `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`)
	writeToFile({ timestamp, level, service, message, ...data })
}

// Crash handlers write to the file only, never through `write` — if the
// crash came from logging itself, reporting it must not recurse.
function logCrash(kind: string, error: Error): void {
	if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
		consoleBroken = true
		return
	}
	writeToFile({
		timestamp: new Date().toISOString(),
		level: 'error',
		service: 'codelens',
		message: kind,
		error: { message: error.message, stack: error.stack },
	})
}

export const createLogger = (service: string): Logger => ({
	debug: (message, meta) => write(service, 'debug', message, meta),
	info: (message, meta) => write(service, 'info', message, meta),
	warn: (message, meta) => write(service, 'warn', message, meta),
	error: (message, meta) => write(service, 'error', message, meta),
})

const root = createLogger('codelens')

process.on('unhandledRejection', (reason) => {
	logCrash('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)))
})
process.on('uncaughtException', (error) => {
	logCrash('Uncaught exception', error)
})

export const logPerformance = (operation: string, startTime: number, meta?: Record<string, unknown>): void => {
	root.info(`Performance: ${operation}`, { duration: `${Date.now() - startTime}ms`, ...meta })
}

export const logApiCall = (
	method: string,
	endpoint: string,
	statusCode?: number,
	duration?: number,
	meta?: Record<string, unknown>,
): void => {
	const entry = {
		method,
		endpoint,
		statusCode,
		duration: duration ? `${duration}ms` : undefined,
		...meta,
	}
	if (statusCode && statusCode >= 400) root.error(`API Call: ${method} ${endpoint}`, entry)
	else root.info(`API Call: ${method} ${endpoint}`, entry)
}

const ELECTRON_ERROR_PATTERNS = [
	/Network service crashed, restarting service/,
	/DevTools listening on/,
	/\[.*?\]\sGPU process isn't usable\. Goodbye\./,
	/\[.*?\]\sThe GPU process has crashed/,
	/Failed to load module "canberra-gtk-module"/,
	/\[.*?\]\sPassthrough is not supported/,
]

export const suppressElectronErrors = (): void => {
	const originalConsoleError = console.error
	console.error = (...args: unknown[]) => {
		const message = args.join(' ')
		if (ELECTRON_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return
		originalConsoleError.apply(console, args)
	}
}
