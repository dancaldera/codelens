# CodeLens

AI-powered code analysis from screenshots. An Electron application that captures code screenshots and uses OpenRouter AI vision models to analyze, extract, and explain code with complexity analysis.

## Features

- **OpenRouter AI Integration**: Access multiple AI vision models through OpenRouter
- **Screenshot Capture**: Press `Cmd+H` to capture code screenshots (cycles between 2 slots)
- **Voice Context**: Press `Shift+Cmd+H` to record a short voice note that guides the next analysis
- **Auto-Analysis**: Automatically analyzes after capturing 2 screenshots
- **Manual Analysis**: Press `Cmd+Enter` to analyze screenshots, voice-only context, or both
- **Smart Analysis**: Automatically detects code problems, snippets, errors, documents, UI designs, charts, and general questions
- **Code-Aware Output**: Extracts code, explains behavior, suggests fixes, and includes complexity analysis when relevant
- **Always-on-top overlay**: Stays visible on all workspaces and fullscreen apps
- **Multi-screen support**: Works across all displays and virtual desktops

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. **Set up OpenRouter API Key** (required for AI analysis):
   ```bash
   export OPENROUTER_API_KEY="sk-your-openrouter-api-key-here"
   ```
   Or copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   # then edit OPENROUTER_API_KEY
   ```
4. Start the application: `npm start`

## Configuration

### OpenRouter Setup

CodeLens uses OpenRouter for AI-powered screenshot analysis and speech-to-text voice context. No separate STT API key is required.

**Method 1: Environment Variables (Recommended for development)**
```bash
export OPENROUTER_API_KEY="sk-your-openrouter-api-key-here"

# Optional: OpenRouter site tracking
export OPENROUTER_SITE_URL="https://your-site.com"
export OPENROUTER_SITE_NAME="Your Site Name"
```

**Method 2: .env File (Works in both development and production)**

For **development**, create `.env` in the project root:
```
OPENROUTER_API_KEY=sk-your-openrouter-api-key-here
OPENROUTER_SITE_URL=https://your-site.com
OPENROUTER_SITE_NAME=Your Site Name
```

For **packaged applications**, create `.env` in one of these locations:
- **Next to the app executable** (e.g., next to `CodeLens.app` on macOS)
- **In your home directory** (`~/.env`)
- **In the current working directory** where you launch the app

**Method 3: Home Directory .env (Easiest for packaged apps)**
```bash
echo "OPENROUTER_API_KEY=sk-your-openrouter-api-key-here" > ~/.env
```

### Available Models

**OpenRouter provides access to multiple AI models:**
- `anthropic/claude-sonnet-4.6` ⭐ **(default)** - Current balanced Claude model for code screenshots
- `google/gemini-3.5-flash` - Fast multimodal coding model
- `openai/gpt-5.5` - OpenAI frontier vision/coding model
- The app refreshes the full programming + vision catalog from OpenRouter at startup and falls back to a curated offline list if the API is unavailable.

**Get API Key:** [OpenRouter](https://openrouter.ai/keys)

**Model Switching:**
- Use `Cmd+M` to cycle between available analysis models during runtime
- Use `Shift+Cmd+M` to cycle between OpenRouter speech-to-text models
- Current analysis and voice models are displayed in the sidebar with color-coded badges
- No API key? The app will show "No API Key" indicator

> **Note:** An OpenRouter API key is required for AI analysis. Get one at [openrouter.ai](https://openrouter.ai/keys).

## Keyboard Shortcuts

**Screenshot, Voice & Analysis**
- `Cmd+H` - Take screenshot (cycles between slots 1-2, auto-analyzes after 2nd screenshot)
- `Shift+Cmd+H` - Start/stop voice recording; transcript is added as context to analysis
- `Cmd+Enter` - Manually trigger analysis with screenshots, voice-only context, or both

**Window Management**
- `Cmd+G` - Reset screenshots, clear analysis, and reposition window to (50,50)
- `Cmd+B` - Hide/show window
- `Cmd+Q` - Quit application
- `Cmd+Arrow Keys` - Move window (50px steps)
- `Shift+Cmd+Arrow Keys` - Move window fast (200px steps)
- `Cmd+1` - Decrease window opacity
- `Cmd+2` - Increase window opacity

**Model Selection**
- `Cmd+M` - Switch AI model (cycles through the latest OpenRouter programming vision catalog)
- `Shift+Cmd+M` - Switch STT model (cycles through the latest OpenRouter transcription catalog)

## Using Voice Context

Voice context lets you record a short spoken note that CodeLens transcribes with OpenRouter speech-to-text and injects into the next analysis as `USER SPOKEN CONTEXT`. It's the fastest way to tell the model what you actually want from a screenshot.

> On Windows/Linux, use `Ctrl` instead of `Cmd` in the shortcuts below.

**Quick start:**

1. Press `Shift+Cmd+H` to start recording. A card appears in the top-right corner with a live timer.
2. Speak your intent — for example, "explain this error and suggest a fix."
3. Press `Shift+Cmd+H` again to stop. CodeLens transcribes the note and **automatically triggers analysis** — no extra keypress needed.
4. The result appears in the overlay.

**Two ways to use it:**

- **Voice + screenshots** — capture screenshots (`Cmd+H`), and your voice note guides how they're interpreted. If the note conflicts with what's on screen, the model favors what's visible and notes the conflict.
- **Voice-only** — record without any screenshots; the transcript becomes the full prompt. You can also keep recording while you capture screenshots to combine both.

**Choosing the transcription model:**

- Press `Shift+Cmd+M` to cycle the STT model. The active model is shown as a color-coded badge in the sidebar.
- Available models: `openai/gpt-4o-mini-transcribe` (default), `openai/gpt-4o-transcribe`, and `openai/whisper-1`.
- The app refreshes the transcription catalog from OpenRouter at startup and falls back to this curated list if the API is unavailable.

**Good to know:**

- Voice uses the same `OPENROUTER_API_KEY` as analysis — no separate STT key is required.
- Microphone permission is requested the first time you record (see [macOS Permissions Setup](#macos-permissions-setup)).
- Recordings are capped at 120 seconds; keep notes short for the fastest turnaround.

### Troubleshooting Voice Issues

If voice recording or transcription fails, the recording card surfaces the problem:

- **"No API Key"** — set `OPENROUTER_API_KEY` (see [Configuration](#configuration)) and restart the app.
- **"Check microphone or model setup"** / no audio recorded — grant microphone access (System Settings > Privacy & Security > Microphone), confirm the correct input device is selected, then try a different STT model with `Shift+Cmd+M`.
- **Transcript is empty or inaccurate** — speak clearly, keep the note under the 120-second cap, and switch STT models with `Shift+Cmd+M`.

## macOS Permissions Setup

### For Individual Window Capture (Recommended)

CodeLens also requests microphone permission when using voice context (`Shift+Cmd+H`).

To capture individual application windows instead of just desktop screenshots:

1. **Go to System Preferences > Security & Privacy > Privacy > Screen Recording**
2. **Find your app** in the list (may appear as "Electron" or "CodeLens")
3. **Check the checkbox** to enable screen recording permission
4. **Completely quit and restart** the application

After granting permission, the app will capture individual windows instead of the entire desktop.

### Troubleshooting Screenshot Issues

If screenshots fail completely:

- **Check Screen Recording permission** (see above)
- **Try running the app from terminal** to see error messages
- **Restart the app** after granting permissions

The app has a fallback mechanism:
- **Primary method**: Individual window capture (requires screen recording permission)
- **Fallback method**: Full desktop screenshot (works without special permissions)

## Development

**Development:**
- `npm run dev` - Start development with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Build and run the application
- `npm run typescript-check` - Type check without compilation
- `npm run watch` - Watch TypeScript files for changes

**Code Quality:**
- `npm run format` - Format code with Biome
- `npm run lint` - Lint and auto-fix with Biome
- `npm run check` - Run both formatting and linting

**Testing:**
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage

**Packaging:**
- `npm run package` - Build an unsigned local macOS `.dmg` (skips macOS code signing)
- `npm run package-mac-signed` - Build a signed macOS `.dmg` when your Apple certificate/keychain setup is ready
- `npm run package-win` - Build Windows installer
- `npm run package-linux` - Build Linux AppImage
- `npm run package-all` - Build for all platforms

For local macOS packaging, the default script intentionally sets `mac.identity=null` to avoid Electron Builder auto-discovering a signing identity and stalling at the `signing` step. Use the signed variant only for release builds that are meant to go through Apple code signing.

## Technical Details

**Architecture:**
- **Main Process**: Electron app with screenshot capture and IPC communication
- **Code Analyzer**: OpenRouter integration for vision-based code analysis
- **Logger**: Winston-based logging with Electron error suppression
- **UI**: Minimal overlay (800x600) with markdown rendering and syntax highlighting

**Screenshot Workflow:**
- Uses Electron's `desktopCapturer` API for individual window capture
- Falls back to macOS native `screencapture` command
- Stores temporary screenshots under the OS temp directory in `codelens-screenshots/` and cleans session files on reset/quit
- Two-screenshot workflow with automatic analysis after second capture
- Subsequent screenshots use previous analysis as context for incremental updates

**AI Analysis:**
- OpenRouter integration with extended timeouts (60s total, 50s API)
- Model switching with `Cmd+M` (latest OpenRouter programming vision models)
- Auto-triggers analysis after capturing 2 screenshots
- Manual trigger with `Cmd+Enter` for screenshots, voice-only context, or both

**Smart Analysis:**
- Automatically detects the screenshot type and formats the answer for code, errors, documents, UI designs, charts, and general questions.
- Uses previous analysis as context for new screenshots (contextual analysis)
- Extracts code with language detection and problem-solving guidance when relevant
- Provides complexity analysis (time/space) for algorithmic solutions
- Structured output with markdown formatting and syntax highlighting
- Smart API key detection with model status display

**UI/UX:**
- Modern, clean interface with 1400x2000 default overlay and 600x400 minimum size
- Sidebar with screenshot thumbnails and model indicator
- Color-coded model badges (Purple for Claude, Blue for Gemini, Green for GPT)
- Dark theme optimized for code visibility
- Smooth animations and transitions
- Proper scrolling for long analysis results

**Development Stack:**
- TypeScript with strict mode and ES2020 target
- Biome for formatting and linting with consistent code style
- npm for package management and script execution, with Vitest for testing
- Winston for structured logging with Electron error suppression
- Unified CSS architecture (single app.css file)
- Local renderer vendor assets with a restrictive Content Security Policy
- Concurrent development workflow with hot reload

**File Structure:**
- `src/main.ts` - Electron main process
- `src/renderer.ts` - Frontend renderer script
- `src/services/` - OpenRouter service and providers
- `src/lib/` - Utilities and logging
- `styles/app.css` - Unified stylesheet
- `test/` - Test suite

## Why OpenRouter?

OpenRouter provides several advantages:
- Access to multiple AI models through a single API
- Competitive pricing compared to direct API access
- No vendor lock-in - switch models easily
- Support for latest programming vision models (Claude Sonnet/Opus, Gemini, GPT, Kimi, Mistral, and more as OpenRouter updates)
- Simple API key management

## Contributing

Contributions are welcome! Review `AGENTS.md` for structure, workflows, and review expectations before opening a focused Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Daniel Caldera
