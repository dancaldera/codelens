# CodeLens

AI-powered code analysis from screenshots. An Electron application that captures code screenshots and uses AI vision models (OpenAI GPT-4o, OpenRouter) to analyze, extract, and explain code with complexity analysis.

## Features

- **Multi-Provider AI Analysis**: Support for OpenAI and OpenRouter with multiple vision models
- **Screenshot Capture**: Press `Cmd+H` to capture code screenshots (cycles between 2 slots)
- **Code Extraction**: Extracts and formats code with syntax highlighting
- **Complexity Analysis**: Provides time/space complexity analysis
- **Language Detection**: Automatically detects programming languages
- **Always-on-top overlay**: Stays visible on all workspaces and fullscreen apps
- **Multi-screen support**: Works across all displays and virtual desktops

## Installation

1. Clone this repository
2. Install dependencies: `bun install`
3. **Set up AI Provider API Key** (required for AI analysis):
   ```bash
   # For OpenAI (primary)
   export OPENAI_API_KEY="sk-your-openai-api-key-here"
   
   # For OpenRouter (alternative)
   export OPENROUTER_API_KEY="sk-your-openrouter-api-key-here"
   ```
   Or create a `.env` file in the project root:
   ```
   OPENAI_API_KEY=sk-your-openai-api-key-here
   OPENROUTER_API_KEY=sk-your-openrouter-api-key-here
   ```
4. Start the application: `bun start`

## Configuration

### AI Provider Setup

CodeLens supports multiple AI providers for code analysis. Configure one or both providers:

**Method 1: Environment Variables (Recommended for development)**
```bash
# OpenAI (primary provider)
export OPENAI_API_KEY="sk-your-openai-api-key-here"

# OpenRouter (alternative provider)
export OPENROUTER_API_KEY="sk-your-openrouter-api-key-here"

# Optional: Force specific provider
export AI_PROVIDER="openai"  # or "openrouter"

# Optional: OpenRouter site tracking
export OPENROUTER_SITE_URL="https://your-site.com"
export OPENROUTER_SITE_NAME="Your Site Name"
```

**Method 2: .env File (Works in both development and production)**

For **development**, create `.env` in the project root:
```
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENROUTER_API_KEY=sk-your-openrouter-api-key-here
AI_PROVIDER=openai
```

For **packaged applications**, create `.env` in one of these locations:
- **Next to the app executable** (e.g., next to `CodeLens.app` on macOS)
- **In your home directory** (`~/.env`)
- **In the current working directory** where you launch the app

**Method 3: Home Directory .env (Easiest for packaged apps)**
```bash
echo "OPENAI_API_KEY=sk-your-openai-api-key-here" > ~/.env
echo "OPENROUTER_API_KEY=sk-your-openrouter-api-key-here" >> ~/.env
```

### Provider Information

**OpenAI (Primary Provider):**
- Models: `gpt-4o`, `gpt-4o-mini`
- Get API key: [OpenAI Platform](https://platform.openai.com/api-keys)
- Requires API credits for GPT-4o vision model

**OpenRouter (Alternative Provider):**
- Models: `openai/gpt-4o`, `openai/gpt-4o-mini`
- Get API key: [OpenRouter](https://openrouter.ai/keys)
- Access OpenAI models through OpenRouter with competitive pricing

**Provider Selection:**
- App automatically detects available providers based on configured API keys
- Priority: OpenAI → OpenRouter → Default (OpenAI with "no key" state)
- Use `Cmd+P` to cycle between configured providers during runtime
- Use `Cmd+M` to cycle between available models for the current provider

> **Note:** At least one provider API key is required for AI analysis. The app will show "No key provided" if no valid keys are configured.

## Keyboard Shortcuts

- `Cmd+H` - Take screenshot (cycles between screenshots 1-2, auto-analyzes after 2nd screenshot)
- `Cmd+G` - Reset screenshots, clear analysis, and reposition window to (50,50)
- `Cmd+B` - Hide/show window
- `Cmd+M` - Switch AI model (cycles through available models for current provider)
- `Cmd+P` - Switch AI provider (OpenAI ↔ OpenRouter)
- `Cmd+Q` - Quit application

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

**Code Quality:**
- `bun run format` - Format code with Biome
- `bun run lint` - Lint and auto-fix with Biome
- `bun run check` - Run both formatting and linting

**Packaging:**
- `bun run package` - Build macOS .dmg
- `bun run package-win` - Build Windows installer
- `bun run package-linux` - Build Linux AppImage
- `bun run package-all` - Build for all platforms

## Technical Details

**Architecture:**
- **Main Process**: Electron app with screenshot capture and IPC communication
- **Code Analyzer**: Multi-provider AI integration (OpenAI/OpenRouter) for vision-based code analysis
- **Logger**: Winston-based logging with Electron error suppression
- **UI**: Minimal overlay with markdown rendering, syntax highlighting, and provider status display

**Screenshot Workflow:**
- Uses Electron's `desktopCapturer` API for individual window capture
- Falls back to macOS native `screencapture` command
- Two-screenshot workflow with automatic analysis after second capture
- Subsequent screenshots use previous analysis as context for incremental updates

**AI Analysis:**
- Multi-provider support: OpenAI GPT-4o and OpenRouter with extended timeouts (60s)
- Provider switching with `Cmd+P` and model switching with `Cmd+M`
- Auto-triggers analysis after capturing 2 screenshots
- Uses previous analysis as context for new screenshots (contextual analysis)
- Extracts code with language detection and problem solving
- Provides complexity analysis (time/space) and best practices
- Structured output with markdown formatting and syntax highlighting
- Smart API key detection with provider status display

**Development Stack:**
- TypeScript with strict mode and ES2020 target
- Biome for formatting and linting with consistent code style
- Winston for structured logging with Electron error suppression
- Simplified dark theme with opacity-based colors
- Component-based CSS architecture
- Concurrent development workflow with hot reload
