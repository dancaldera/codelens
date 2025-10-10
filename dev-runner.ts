#!/usr/bin/env node

/**
 * Development runner script
 * Manages both TypeScript watch compilation and Electron dev watcher
 * Replaces concurrently with a vanilla Node.js solution
 */

import { type ChildProcess, spawn } from "node:child_process";

// ANSI color codes for better output readability
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	cyan: "\x1b[36m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	green: "\x1b[32m",
} as const;

// Process management
const processes: Map<string, ChildProcess> = new Map();
let isShuttingDown = false;

/**
 * Color a message for console output
 */
function colorize(color: keyof typeof colors, message: string): string {
	return `${colors[color]}${message}${colors.reset}`;
}

/**
 * Format a prefixed log message
 */
function log(prefix: string, message: string, color: keyof typeof colors = "cyan"): void {
	const coloredPrefix = colorize("bright", `[${prefix}]`);
	console.log(`${coloredPrefix} ${colorize(color, message)}`);
}

/**
 * Spawn a child process and manage its lifecycle
 */
function spawnProcess(
	name: string,
	command: string,
	args: string[],
	color: keyof typeof colors = "cyan",
): ChildProcess {
	log(name, `Starting: ${command} ${args.join(" ")}`, color);

	const child = spawn(command, args, {
		stdio: "pipe",
		shell: true,
		env: { ...process.env, FORCE_COLOR: "1" },
	});

	// Handle stdout
	child.stdout?.on("data", (data: Buffer) => {
		const lines = data.toString().trim().split("\n");
		for (const line of lines) {
			if (line.trim()) {
				console.log(`${colorize("bright", `[${name}]`)} ${line}`);
			}
		}
	});

	// Handle stderr
	child.stderr?.on("data", (data: Buffer) => {
		const lines = data.toString().trim().split("\n");
		for (const line of lines) {
			if (line.trim()) {
				console.error(`${colorize("bright", `[${name}]`)} ${colorize("red", line)}`);
			}
		}
	});

	// Handle process exit
	child.on("exit", (code: number | null, signal: string | null) => {
		// Don't log if we're already shutting down gracefully
		if (!isShuttingDown) {
			if (signal && signal !== "SIGTERM") {
				log(name, `Killed by signal: ${signal}`, "yellow");
			} else if (code !== null && code !== 0) {
				log(name, `Exited with code: ${code}`, "red");
			}
		}
		processes.delete(name);

		// If any process exits unexpectedly, shut down all
		if (!isShuttingDown && code !== null && code !== 0 && signal !== "SIGTERM") {
			log("dev-runner", "Process exited unexpectedly, shutting down...", "red");
			shutdown(1);
		}
	});

	// Handle errors
	child.on("error", (error: Error) => {
		log(name, `Error: ${error.message}`, "red");
	});

	processes.set(name, child);
	return child;
}

/**
 * Shutdown all processes gracefully
 */
function shutdown(exitCode: number = 0): void {
	// Prevent multiple shutdown attempts
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	if (processes.size === 0) {
		process.exit(exitCode);
		return;
	}

	log("dev-runner", "Shutting down all processes...", "yellow");

	for (const [name, child] of processes) {
		log(name, "Stopping...", "yellow");
		child.kill("SIGTERM");
	}

	// Force exit after timeout
	setTimeout(() => {
		if (processes.size > 0) {
			log("dev-runner", "Force killing remaining processes...", "red");
			for (const [, child] of processes) {
				child.kill("SIGKILL");
			}
		}
		process.exit(exitCode);
	}, 2000);
}

/**
 * Initialize and start all development processes
 */
function init(): void {
	console.log(colorize("bright", "\n=== Development Runner ===\n"));

	// Start TypeScript watch compiler
	spawnProcess("tsc-watch", "tsc", ["-w"], "cyan");

	// Small delay to let TypeScript start first
	setTimeout(() => {
		// Start Electron development watcher
		spawnProcess("electron-dev", "bun", ["run", "dev-watcher.ts"], "green");
	}, 1000);

	// Handle process signals (only log once)
	process.on("SIGINT", () => {
		if (!isShuttingDown) {
			console.log(colorize("yellow", "\n\nReceived SIGINT, shutting down..."));
		}
		shutdown(0);
	});

	process.on("SIGTERM", () => {
		if (!isShuttingDown) {
			console.log(colorize("yellow", "\nReceived SIGTERM, shutting down..."));
		}
		shutdown(0);
	});

	// Handle uncaught errors
	process.on("uncaughtException", (error: Error) => {
		log("dev-runner", `Uncaught exception: ${error.message}`, "red");
		console.error(error.stack);
		shutdown(1);
	});

	process.on("unhandledRejection", (reason: unknown) => {
		log("dev-runner", `Unhandled rejection: ${reason}`, "red");
		shutdown(1);
	});
}

// Start the development runner
init();
