# CodeLens

AI-powered code analysis from screenshots. An Electron application that captures code screenshots and uses OpenRouter AI vision models to analyze, extract, and explain code with complexity analysis.

## Features

- **OpenRouter AI Integration**: Access multiple AI vision models through OpenRouter
- **Screenshot Capture**: Press `Cmd+H` to capture code screenshots (cycles between 2 slots)
- **Auto-Analysis**: Automatically analyzes after capturing 2 screenshots
- **Code Extraction**: Extracts and formats code with syntax highlighting
- **Complexity Analysis**: Provides time/space complexity analysis
- **Language Detection**: Automatically detects programming languages
- **Always-on-top overlay**: Stays visible on all workspaces and fullscreen apps
- **Multi-screen support**: Works across all displays and virtual desktops

## Installation

1. Clone this repository
2. Install dependencies: `bun install`
3. **Set up OpenRouter API Key** (required for AI analysis):
   ```bash
   export OPENROUTER_API_KEY="sk-your-openrouter-api-key-here"
   ```
   Or create a `.env` file in the project root:
   ```
   OPENROUTER_API_KEY=sk-your-openrouter-api-key-here
   ```
4. Start the application: `bun start`

## Configuration

### OpenRouter Setup

CodeLens uses OpenRouter for AI-powered code analysis.

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
- `anthropic/claude-sonnet-4.5` ⭐ **(default)** - Latest Claude Sonnet, best for code
- `google/gemini-2.5-pro` - Google's latest vision model
- `openai/gpt-5` - OpenAI's GPT-5 via OpenRouter

**Get API Key:** [OpenRouter](https://openrouter.ai/keys)

**Model Switching:**
- Use `Cmd+M` to cycle between available models during runtime
- Current model displayed in the sidebar with color-coded badge
- No API key? The app will show "No API Key" indicator

> **Note:** An OpenRouter API key is required for AI analysis. Get one at [openrouter.ai](https://openrouter.ai/keys).

## Keyboard Shortcuts

- `Cmd+H` - Take screenshot (cycles between slots 1-2, auto-analyzes after 2nd screenshot)
- `Cmd+G` - Reset screenshots, clear analysis, and reposition window to (50,50)
- `Cmd+B` - Hide/show window
- `Cmd+M` - Switch AI model (cycles through: Sonnet 4.5 → Gemini 2.5 → GPT-5)
- `Cmd+1` - Decrease window opacity
- `Cmd+2` - Increase window opacity
- `Cmd+Q` - Quit application
- `Cmd+Arrow Keys` - Move window (50px steps)
- `Shift+Cmd+Arrow Keys` - Move window fast (200px steps)

## macOS Permissions Setup

### For Individual Window Capture (Recommended)

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
- `bun run dev` - Start development with hot reload
- `bun run build` - Compile TypeScript to JavaScript
- `bun start` - Build and run the application
- `bun run typescript-check` - Type check without compilation
- `bun run watch` - Watch TypeScript files for changes
- `bun run electron-dev` - Run Electron with nodemon auto-restart

**Code Quality:**
- `bun run format` - Format code with Biome
- `bun run lint` - Lint and auto-fix with Biome
- `bun run check` - Run both formatting and linting

**Testing:**
- `bun test` - Run all tests
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage

**Packaging:**
- `bun run package` - Build macOS .dmg
- `bun run package-win` - Build Windows installer
- `bun run package-linux` - Build Linux AppImage
- `bun run package-all` - Build for all platforms

## Technical Details

**Architecture:**
- **Main Process**: Electron app with screenshot capture and IPC communication
- **Code Analyzer**: OpenRouter integration for vision-based code analysis
- **Logger**: Winston-based logging with Electron error suppression
- **UI**: Minimal overlay (800x600) with markdown rendering and syntax highlighting

**Screenshot Workflow:**
- Uses Electron's `desktopCapturer` API for individual window capture
- Falls back to macOS native `screencapture` command
- Two-screenshot workflow with automatic analysis after second capture
- Subsequent screenshots use previous analysis as context for incremental updates

**AI Analysis:**
- OpenRouter integration with extended timeouts (60s total, 50s API)
- Model switching with `Cmd+M` (3 models available)
- Auto-triggers analysis after capturing 2 screenshots
- Uses previous analysis as context for new screenshots (contextual analysis)
- Extracts code with language detection and problem solving
- Provides complexity analysis (time/space) and best practices
- Structured output with markdown formatting and syntax highlighting
- Smart API key detection with model status display

**UI/UX:**
- Modern, clean interface with 800x600 default window
- Sidebar with screenshot thumbnails and model indicator
- Color-coded model badges (Purple for Claude, Blue for Gemini, Green for GPT)
- Dark theme optimized for code visibility
- Smooth animations and transitions
- Proper scrolling for long analysis results

**Development Stack:**
- TypeScript with strict mode and ES2020 target
- Biome for formatting and linting with consistent code style
- Bun for package management and testing
- Winston for structured logging with Electron error suppression
- Unified CSS architecture (single app.css file)
- Concurrent development workflow with hot reload

**File Structure:**
- `src/main.ts` - Electron main process
- `src/renderer.js` - Frontend renderer script
- `src/services/` - OpenRouter service and providers
- `src/lib/` - Utilities and logging
- `styles/app.css` - Unified stylesheet
- `test/` - Test suite

## Why OpenRouter?

OpenRouter provides several advantages:
- Access to multiple AI models through a single API
- Competitive pricing compared to direct API access
- No vendor lock-in - switch models easily
- Support for latest models (Claude Sonnet 4.5, Gemini 2.5, GPT-5)
- Simple API key management

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Daniel Caldera
