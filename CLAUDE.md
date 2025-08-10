# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

**Development:**
- `npm run dev` - Start development mode with hot reload (TypeScript watch + Electron restart)
- `npm run build` - Compile TypeScript to JavaScript in dist/ folder
- `npm start` - Build and run the Electron application
- `npm run typescript-check` - Type check without compilation

**Packaging:**
- `npm run package` - Build macOS .dmg package
- `npm run package-win` - Build Windows installer  
- `npm run package-linux` - Build Linux AppImage
- `npm run package-all` - Build for all platforms

**File Structure:**
- Source files in `src/` compile to `dist/`
- Logs written to `logs/` directory (app.log, error.log, exceptions.log, rejections.log)
- Screenshots saved to system temp directory with pattern `screenshot-{1|2}-{timestamp}.png`

## Architecture Overview

**Visual Context Analyzer (VCA)** is an Electron application for AI-powered code analysis from screenshots. The application consists of:

### Core Components

**Main Process (`src/main.ts`):**
- Creates always-on-top overlay window with keyboard shortcuts
- Handles screenshot capture via `desktopCapturer` API with fallback to macOS `screencapture`
- Manages two-screenshot workflow (cycles between screenshot-1 and screenshot-2)
- Global shortcuts: `Cmd+H` (screenshot), `Cmd+G` (reset), `Cmd+B` (hide/show), `Cmd+Q` (quit)

**Code Analyzer (`src/codeAnalyzer.ts`):**
- OpenAI GPT-4o integration for vision-based code analysis
- Structured output with code extraction, complexity analysis, and language detection
- Context-aware analysis that can extend previous results with new screenshots
- Comprehensive error handling and logging

**Preload Script (`src/preload.ts`):**
- Context bridge for secure renderer-main communication
- DevTools protocol error suppression (Autofill API stubs)
- IPC event handling for screenshots, analysis results, and UI updates

**Logger (`src/logger.ts`):**
- Winston-based logging with file rotation (5MB max, 5 files)
- Separate error and exception logging
- Performance and API call tracking utilities

### UI and UX

**Frontend (`index.html`):**
- Minimal overlay UI with two screenshot thumbnails
- Markdown rendering with syntax highlighting (marked.js + highlight.js)
- Language selection dropdown for targeted analysis
- Auto-analysis trigger after second screenshot
- API key management with masked input

### Key Technical Details

**Screenshot Workflow:**
1. Hide window temporarily during capture
2. Try `desktopCapturer` first (requires Screen Recording permission)  
3. Fallback to macOS `screencapture` command if needed
4. Cycle between screenshot slots 1 and 2
5. Auto-trigger analysis after screenshot 2

**macOS Permissions:**
- Screen Recording permission required for individual window capture
- Comprehensive entitlements in `entitlements.mac.plist` including camera, microphone, automation
- Hardened runtime with code signing for distribution

**Build Configuration:**
- TypeScript with ES2020 target, CommonJS modules
- electron-builder for cross-platform packaging
- ASAR archive with maximum compression
- Separate outputs for macOS (.dmg), Windows (.exe), Linux (.AppImage)

## Development Notes

**Environment Setup:**
- Requires OpenAI API key in environment variables or UI input
- Development uses nodemon for auto-restart on file changes
- TypeScript strict mode enabled with source maps

**Logging Strategy:**
- All components use structured logging with Winston
- Main process operations logged with performance metrics
- API calls tracked with duration and response codes
- DevTools protocol errors automatically suppressed in renderer

**Error Handling:**
- Graceful fallbacks for screenshot capture methods  
- Timeout protection for AI analysis (30s)
- Default responses for failed operations
- Comprehensive error logging without exposing sensitive data