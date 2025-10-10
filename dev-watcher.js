#!/usr/bin/env node

/**
 * Simple file watcher for Electron development
 * Watches for changes and restarts Electron automatically
 * No external dependencies - uses Node.js built-in fs.watch
 */

const { spawn } = require('node:child_process');
const { watch } = require('node:fs');
const path = require('node:path');

// Paths to watch
const WATCH_PATHS = ['dist', 'index.html', 'styles'];

let electronProcess = null;
let restartTimeout = null;

/**
 * Start the Electron process
 */
function startElectron() {
	console.log('[dev-watcher] Starting Electron...');

	electronProcess = spawn('electron', ['.'], {
		stdio: 'inherit',
		env: { ...process.env }
	});

	electronProcess.on('exit', (code) => {
		if (code !== null && code !== 0 && code !== 143) {
			console.log(`[dev-watcher] Electron exited with code ${code}`);
		}
	});
}

/**
 * Stop the Electron process
 */
function stopElectron() {
	if (electronProcess) {
		console.log('[dev-watcher] Stopping Electron...');
		electronProcess.kill('SIGTERM');
		electronProcess = null;
	}
}

/**
 * Restart Electron with debouncing
 */
function restartElectron(changedFile) {
	// Clear any pending restart
	if (restartTimeout) {
		clearTimeout(restartTimeout);
	}

	// Debounce restarts (wait 300ms for multiple file changes)
	restartTimeout = setTimeout(() => {
		console.log(`[dev-watcher] File changed: ${changedFile}`);
		stopElectron();
		startElectron();
	}, 300);
}

/**
 * Watch a directory or file for changes
 */
function startWatching(pathToWatch) {
	const fullPath = path.resolve(pathToWatch);

	console.log(`[dev-watcher] Watching: ${pathToWatch}`);

	watch(fullPath, { recursive: true }, (eventType, filename) => {
		if (filename) {
			// Ignore certain files
			if (filename.includes('.log') ||
			    filename.includes('node_modules') ||
			    filename.startsWith('.')) {
				return;
			}

			const changedPath = path.join(pathToWatch, filename);
			restartElectron(changedPath);
		}
	});
}

/**
 * Initialize watcher
 */
function init() {
	console.log('[dev-watcher] Starting development watcher...\n');

	// Watch all specified paths
	for (const watchPath of WATCH_PATHS) {
		startWatching(watchPath);
	}

	// Start Electron initially
	startElectron();

	// Handle process termination
	process.on('SIGINT', () => {
		console.log('\n[dev-watcher] Shutting down...');
		stopElectron();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		stopElectron();
		process.exit(0);
	});
}

// Start the watcher
init();
