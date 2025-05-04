# Electron Overlay Window Example

This is a simple Electron application demonstrating how to create an overlay window that stays on top of other applications, including fullscreen ones.

## Features

- Frameless window design
- Always-on-top functionality
- Visible on all workspaces including fullscreen applications
- Draggable interface

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Start the application: `npm start`

## Key Implementation Details

- `setVisibleOnAllWorkspaces(true)` - Makes the window visible across all virtual desktops
- `setAlwaysOnTop(true, "floating")` - Sets the window to stay on top of other windows
- `setFullScreenable(false)` - Prevents the window from being made fullscreen
- Frameless window design with custom close button
- CSS `-webkit-app-region: drag` for window dragging functionality
