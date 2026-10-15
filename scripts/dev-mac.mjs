// macOS dev launcher with a stable TCC (privacy permission) identity.
//
// Plain `electron .` runs as the stock Electron binary (com.github.Electron),
// so macOS attaches Screen Recording / Microphone grants to "Electron" —
// shared with every other Electron dev app and reset whenever a pnpm
// reinstall swaps the binary, which makes screenshot capture fail silently.
//
// This script instead maintains a local `dev-app/CodeLens Dev.app`: a copy
// of the installed Electron.app re-branded with our own bundle id and signed
// with a stable code-signing identity. Permissions are granted once to
// "CodeLens Dev" and survive reinstalls and Electron updates (the bundle is
// only rebuilt when the Electron version or signing identity changes).
// electron-vite then launches that binary via ELECTRON_EXEC_PATH, so
// `pnpm run dev:mac` behaves exactly like `pnpm run dev` otherwise.
//
// Usage:
//   node scripts/dev-mac.mjs            build bundle if needed, start dev
//   node scripts/dev-mac.mjs --setup    build bundle, open Screen Recording settings
//
// Signing identity: $CODELENS_CODESIGN_IDENTITY, else the first valid
// codesigning identity in the keychain, else ad-hoc (grant may then need
// redoing after Electron updates).

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE_ID = 'com.dancaldera.codelens.dev'
const APP_NAME = 'CodeLens Dev'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function fail(message) {
	console.error(`dev:mac: ${message}`)
	process.exit(1)
}

function findSigningIdentity() {
	if (process.env.CODELENS_CODESIGN_IDENTITY) return process.env.CODELENS_CODESIGN_IDENTITY
	try {
		const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
		const match = output.match(/"([^"]+)"/)
		if (match) return match[1]
	} catch {
		// fall through to ad-hoc
	}
	return '-'
}

function setPlistValue(plist, key, value) {
	const buddy = '/usr/libexec/PlistBuddy'
	try {
		execFileSync(buddy, ['-c', `Set :${key} ${value}`, plist], { stdio: 'pipe' })
	} catch {
		execFileSync(buddy, ['-c', `Add :${key} string ${value}`, plist], { stdio: 'pipe' })
	}
}

function ensureDevApp() {
	const electronBinary = require('electron')
	const electronApp = path.resolve(electronBinary, '../../..')
	const electronVersion = require('electron/package.json').version
	const identity = findSigningIdentity()

	const devAppRoot = path.join(projectRoot, 'dev-app')
	const devApp = path.join(devAppRoot, `${APP_NAME}.app`)
	const stampPath = path.join(devAppRoot, '.stamp.json')
	const stamp = { electronVersion, identity, bundleId: BUNDLE_ID }

	if (fs.existsSync(devApp) && fs.existsSync(stampPath)) {
		try {
			if (fs.readFileSync(stampPath, 'utf8') === JSON.stringify(stamp)) return devApp
		} catch {
			// rebuild below
		}
	}

	console.log(`dev:mac: building ${APP_NAME}.app (Electron ${electronVersion}, identity "${identity}")`)
	fs.rmSync(devApp, { recursive: true, force: true })
	fs.mkdirSync(devAppRoot, { recursive: true })
	// APFS clone copy when available: instant and near-zero extra disk.
	try {
		execFileSync('/bin/cp', ['-Rc', electronApp, devApp])
	} catch {
		fs.cpSync(electronApp, devApp, { recursive: true })
	}

	const plist = path.join(devApp, 'Contents', 'Info.plist')
	setPlistValue(plist, 'CFBundleIdentifier', BUNDLE_ID)
	setPlistValue(plist, 'CFBundleName', APP_NAME)
	setPlistValue(plist, 'CFBundleDisplayName', APP_NAME)
	setPlistValue(
		plist,
		'NSMicrophoneUsageDescription',
		'CodeLens records short voice notes to add context to screenshot analysis.',
	)

	execFileSync('codesign', ['--force', '--deep', '--timestamp=none', '--sign', identity, devApp], {
		stdio: 'inherit',
	})
	fs.writeFileSync(stampPath, JSON.stringify(stamp))
	if (identity === '-') {
		console.log('dev:mac: signed ad-hoc (no codesigning identity found); the Screen Recording grant may')
		console.log('dev:mac: need redoing after Electron updates. Set CODELENS_CODESIGN_IDENTITY to avoid this.')
	}
	console.log(`dev:mac: ready. If capture is blocked, enable "${APP_NAME}" under`)
	console.log('dev:mac: System Settings → Privacy & Security → Screen & System Audio Recording, then restart.')
	return devApp
}

if (process.platform !== 'darwin') {
	fail('only needed on macOS; use `pnpm run dev` on this platform.')
}

const devApp = ensureDevApp()
const args = process.argv.slice(2)

if (args.includes('--setup')) {
	execFileSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'])
	console.log(`dev:mac: enable "${APP_NAME}" in the list (add ${devApp} with + if it is missing),`)
	console.log('dev:mac: then run `pnpm run dev:mac`.')
	process.exit(0)
}

const electronExecPath = path.join(devApp, 'Contents', 'MacOS', 'Electron')
const child = spawn('electron-vite', ['dev', ...args.filter((arg) => arg !== '--setup')], {
	cwd: projectRoot,
	stdio: 'inherit',
	env: { ...process.env, ELECTRON_EXEC_PATH: electronExecPath },
})
child.on('exit', (code, signal) => {
	if (signal) process.kill(process.pid, signal)
	process.exit(code ?? 1)
})
