# Visual Context Analyzer (VCA)

A simple Electron application for capturing screenshots with an always-on-top overlay window that works across all screens and workspaces.

## Features

- **Screenshot Capture**: Press `Cmd+H` to capture screenshots
- **Always-on-top overlay**: Stays visible on all workspaces and fullscreen apps
- **Multi-screen support**: Window appears on all displays
- **Simple shortcuts**: Only 3 keyboard shortcuts to remember

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Start the application: `npm start`

## Keyboard Shortcuts

- `Cmd+H` - Take screenshot
- `Cmd+B` - Hide/show window
- `Cmd+Q` - Quit application

## macOS Permissions Setup

### For Individual Window Capture (Recommended)

To capture individual application windows instead of just desktop screenshots:

1. **Go to System Preferences > Security & Privacy > Privacy > Screen Recording**
2. **Find your app** in the list (may appear as "Electron" or "VCA")
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

- Build: `npm run build`
- Development mode: `npm run dev`
- Package for distribution: `npm run package`

## Technical Details

- Uses Electron's `desktopCapturer` API for window capture
- Falls back to macOS native `screencapture` command
- Window stays on top across all workspaces and screens
- Screenshots saved to system temp directory