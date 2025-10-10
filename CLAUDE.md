# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

**Development:**
- `bun run dev` - Start development mode with hot reload (TypeScript watch + Electron restart)
- `bun run build` - Compile TypeScript to JavaScript in dist/ folder
- `bun start` - Build and run the Electron application
- `bun run typescript-check` - Type check without compilation
- `bun run watch` - Watch TypeScript files for changes and recompile
- `bun run electron-dev` - Run Electron with vanilla file watcher for auto-restart

**Code Quality:**
- `bun run format` - Format code using Biome formatter
- `bun run lint` - Lint and auto-fix code using Biome linter
- `bun run check` - Run both formatting and linting with Biome

**Packaging:**
- `bun run package` - Build macOS .dmg package
- `bun run package-win` - Build Windows installer (NSIS)
- `bun run package-linux` - Build Linux AppImage
- `bun run package-all` - Build for all platforms (macOS, Windows, Linux)

**File Structure:**
- Source files in `src/` compile to `dist/`
- Logs written to `logs/` directory (app.log, error.log, exceptions.log, rejections.log)
- Screenshots saved to system temp directory with pattern `screenshot-{1|2}-{timestamp}.png`
- Styles organized in `styles/` with component-based CSS architecture
- Renderer script extracted to `src/renderer.js` for better organization
- Build artifacts output to `release/` directory

## Architecture Overview

**Visual Context Analyzer (VCA)** is an Electron application for AI-powered code analysis from screenshots. The application consists of:

### Core Components

**Main Process (`src/main.ts`):**
- Creates always-on-top overlay window with keyboard shortcuts and enhanced privacy settings
- Handles screenshot capture via `desktopCapturer` API with fallback to macOS `screencapture`
- Manages two-screenshot workflow with auto-analysis and contextual updates
- Global shortcuts: `Cmd+H` (screenshot), `Cmd+G` (reset + reposition window), `Cmd+B` (hide/show), `Cmd+M` (switch AI model), `Cmd+Q` (quit)
- Enhanced security: excludes window from taskbar, macOS content protection against screen capture, hidden window buttons

**Code Analyzer (`src/codeAnalyzer.ts`):**
- **OpenRouter Integration**: Uses OpenRouter for vision-based code analysis with multiple AI models
- **Model Switching**: `Cmd+M` cycles through available models
- **Smart API Key Detection**: Shows "No key provided" when API key is not configured
- **Model Display**: Current model displayed below screenshot thumbnails with visual indicators
- **Available Models**:
  - `anthropic/claude-sonnet-4` (default)
  - `anthropic/claude-sonnet-4.5`
  - `google/gemini-2.5-pro`
  - `openai/gpt-5`
- Structured output with code extraction, complexity analysis, and language detection
- Context-aware analysis that can extend previous results with new screenshots
- Comprehensive error handling and logging with extended timeouts (60s total, 50s API)

**Preload Script (`src/preload.ts`):**
- Context bridge for secure renderer-main communication
- DevTools protocol error suppression (Autofill API stubs)
- IPC event handling for screenshots, analysis results, and UI updates

**Logger (`src/logger.ts`):**
- Winston-based logging with file rotation (5MB max, 5 files)
- Separate error and exception logging
- Performance and API call tracking utilities
- Electron-specific error suppression for common development warnings
- Console error filtering for network service crashes and GPU process issues

### UI and UX

**Frontend (`index.html` + `src/renderer.js`):**
- Minimal overlay UI with 2 screenshot thumbnails (cycles between them)
- Markdown rendering with syntax highlighting (marked.js + highlight.js)
- Auto-analysis after 2nd screenshot with contextual updates
- API key management with masked input and secure storage
- Simplified dark theme with opacity-based colors
- Component-based CSS architecture with clean code boxes
- Optimized renderer logic with removed unused functions

### Key Technical Details

**Screenshot Workflow:**
1. Hide window temporarily during capture
2. Try `desktopCapturer` first (requires Screen Recording permission)  
3. Fallback to macOS `screencapture` command if needed
4. Cycle between screenshot slots 1-2 (MAX_SCREENSHOTS = 2)
5. Auto-trigger analysis after 2nd screenshot
6. Use previous analysis as context for subsequent screenshots

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
- **OpenRouter Configuration**: Set environment variables:
  - `OPENROUTER_API_KEY`: OpenRouter API key (format: `sk-...`) - **Required**
  - `OPENROUTER_SITE_URL`: Optional site URL for OpenRouter rankings
  - `OPENROUTER_SITE_NAME`: Optional site name for OpenRouter rankings
- Development uses vanilla Node.js `fs.watch` for auto-restart on file changes (see `dev-watcher.js`)
- TypeScript strict mode enabled with source maps
- Biome for code formatting and linting with tab indentation
- Concurrently runs TypeScript compiler and Electron in development

**Code Quality Tools:**
- **Biome Integration:** Unified formatter and linter with consistent config
- **TypeScript:** Strict mode with ES2020 target and CommonJS modules
- **Auto-formatting:** Tab indentation, single quotes, trailing commas
- **Import Organization:** Automatic import sorting and cleanup

**Logging Strategy:**
- All components use structured logging with Winston
- Main process operations logged with performance metrics
- API calls tracked with duration and response codes
- Electron-specific error suppression (network service crashes, GPU issues)
- Console error filtering to reduce development noise

**Error Handling:**
- Graceful fallbacks for screenshot capture methods  
- Timeout protection for AI analysis (30s)
- Default responses for failed operations
- Comprehensive error logging without exposing sensitive data
- Pattern-based filtering for common Electron development warnings

**Architecture Improvements:**
- Extracted renderer script from inline HTML for better organization
- Component-based CSS architecture in `styles/` directory
- Modular logging with specialized error suppression
- Enhanced development workflow with concurrent build processes