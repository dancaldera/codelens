#!/usr/bin/env node

/**
 * Simple file watcher for Electron development
 * Watches for changes and restarts Electron automatically
 * No external dependencies - uses Node.js built-in fs.watch
 */

import { spawn, type ChildProcess } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

// Paths to watch
const WATCH_PATHS: readonly string[] = ["dist", "index.html", "styles"] as const;

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

// Exit codes that shouldn't be logged as errors
const EXPECTED_EXIT_CODES = [0, 143] as const;

let electronProcess: ChildProcess | null = null;
let restartTimeout: NodeJS.Timeout | null = null;

/**
 * Start the Electron process
 */
function startElectron(): void {
	console.log("[dev-watcher] Starting Electron...");

	electronProcess = spawn("electron", ["."], {
		stdio: "inherit",
		env: { ...process.env },
	});

	electronProcess.on("exit", (code: number | null) => {
		if (code !== null && !EXPECTED_EXIT_CODES.includes(code as 0 | 143)) {
			console.log(`[dev-watcher] Electron exited with code ${code}`);
		}
	});
}

/**
 * Stop the Electron process
 */
function stopElectron(): void {
	if (electronProcess) {
		console.log("[dev-watcher] Stopping Electron...");
		electronProcess.kill("SIGTERM");
		electronProcess = null;
	}
}

/**
 * Restart Electron with debouncing
 * @param changedFile - Path of the file that changed
 */
function restartElectron(changedFile: string): void {
	// Clear any pending restart
	if (restartTimeout) {
		clearTimeout(restartTimeout);
	}

	// Debounce restarts (wait for multiple file changes)
	restartTimeout = setTimeout(() => {
		console.log(`[dev-watcher] File changed: ${changedFile}`);
		stopElectron();
		startElectron();
	}, DEBOUNCE_DELAY);
}

/**
 * Check if a filename should be ignored
 * @param filename - The filename to check
 * @returns True if the file should be ignored
 */
function shouldIgnoreFile(filename: string): boolean {
	return (
		filename.includes(".log") ||
		filename.includes("node_modules") ||
		filename.startsWith(".")
	);
}

/**
 * Watch a directory or file for changes
 * @param pathToWatch - The path to watch for changes
 * @returns FSWatcher instance
 */
function startWatching(pathToWatch: string): FSWatcher {
	const fullPath = path.resolve(pathToWatch);

	console.log(`[dev-watcher] Watching: ${pathToWatch}`);

	return watch(
		fullPath,
		{ recursive: true },
		(eventType: string, filename: string | null) => {
			if (filename && !shouldIgnoreFile(filename)) {
				const changedPath = path.join(pathToWatch, filename);
				restartElectron(changedPath);
			}
		},
	);
}

/**
 * Handle process shutdown
 * @param signal - The signal that triggered the shutdown
 */
function handleShutdown(signal: "SIGINT" | "SIGTERM"): void {
	if (signal === "SIGINT") {
		console.log("\n[dev-watcher] Shutting down...");
	}
	stopElectron();
	process.exit(0);
}

/**
 * Initialize watcher
 */
function init(): void {
	console.log("[dev-watcher] Starting development watcher...\n");

	// Watch all specified paths
	const watchers: FSWatcher[] = [];
	for (const watchPath of WATCH_PATHS) {
		watchers.push(startWatching(watchPath));
	}

	// Start Electron initially
	startElectron();

	// Handle process termination
	process.on("SIGINT", () => handleShutdown("SIGINT"));
	process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

// Start the watcher
init();
