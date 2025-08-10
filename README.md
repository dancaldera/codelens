# CodeLens

AI-powered code analysis from screenshots. An Electron application that captures code screenshots and uses OpenAI's GPT-4o vision model to analyze, extract, and explain code with complexity analysis.

## Features

- **AI Code Analysis**: GPT-4o vision model analyzes code from screenshots
- **Screenshot Capture**: Press `Cmd+H` to capture code screenshots (cycles through 8 slots)
- **Code Extraction**: Extracts and formats code with syntax highlighting
- **Complexity Analysis**: Provides time/space complexity analysis
- **Language Detection**: Automatically detects programming languages
- **Always-on-top overlay**: Stays visible on all workspaces and fullscreen apps
- **Multi-screen support**: Works across all displays and virtual desktops

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. **Set up OpenAI API Key** (required for AI analysis):
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```
   Or create a `.env` file in the project root:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```
4. Start the application: `npm start`

## Configuration

### OpenAI API Key Setup

CodeLens requires an OpenAI API key to perform AI-powered code analysis. You can configure it in two ways:

**Option 1: Environment Variable (Recommended)**
```bash
export OPENAI_API_KEY="sk-your-openai-api-key-here"
```

**Option 2: Application UI**
- Enter your API key directly in the application's input field
- The key will be stored temporarily for the session

**Getting an API Key:**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Generate a new API key
4. Copy and use it with CodeLens

> **Note:** The application uses GPT-4o vision model, which requires API credits. Make sure your OpenAI account has sufficient credits for analysis.

## Keyboard Shortcuts

- `Cmd+H` - Take screenshot (cycles between screenshots 1-8)
- `Cmd+G` - Reset screenshots, clear analysis, and reposition window to (50,50)
- `Cmd+B` - Hide/show window
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
- `npm run dev` - Start development with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Build and run the application
- `npm run typescript-check` - Type check without compilation

**Code Quality:**
- `npm run format` - Format code with Biome
- `npm run lint` - Lint and auto-fix with Biome
- `npm run check` - Run both formatting and linting

**Packaging:**
- `npm run package` - Build macOS .dmg
- `npm run package-win` - Build Windows installer
- `npm run package-linux` - Build Linux AppImage
- `npm run package-all` - Build for all platforms

## Technical Details

**Architecture:**
- **Main Process**: Electron app with screenshot capture and IPC communication
- **Code Analyzer**: OpenAI GPT-4o integration for vision-based code analysis
- **Logger**: Winston-based logging with Electron error suppression
- **UI**: Minimal overlay with markdown rendering and syntax highlighting

**Screenshot Workflow:**
- Uses Electron's `desktopCapturer` API for individual window capture
- Falls back to macOS native `screencapture` command
- Multi-screenshot workflow (cycles through 8 slots)
- Enhanced prompts for comprehensive code analysis and problem solving

**AI Analysis:**
- GPT-4o vision model processes screenshots with extended timeouts (60s)
- Extracts code with language detection and problem solving
- Provides complexity analysis (time/space) and best practices
- Structured output with markdown formatting and syntax highlighting

**Development Stack:**
- TypeScript with strict mode and ES2020 target
- Biome for formatting and linting with consistent code style
- Winston for structured logging with Electron error suppression
- Simplified dark theme with opacity-based colors
- Component-based CSS architecture
- Concurrent development workflow with hot reload