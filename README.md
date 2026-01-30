# Crunchyroll Speed Controller

A Chrome extension to control video playback speed on Crunchyroll.com with keyboard shortcuts and an on-screen indicator.

![Version](https://img.shields.io/badge/version-1.0.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Speed Control**: Adjust playback from 0.25x to 4.0x
- **Popup UI**: Easy-to-use slider and quick-select buttons
- **Keyboard Shortcuts**: Control speed without leaving fullscreen
- **On-Screen Indicator**: See current speed with auto-hiding overlay
- **Remembers Your Speed**: Persists your preferred speed across sessions
- **Dark Theme**: Matches Crunchyroll's aesthetic

## Installation

### Option 1: Chrome Web Store (Recommended)
*Coming soon*

### Option 2: Install from Source (Developer Mode)

1. **Download the extension**
   - Click the green "Code" button above
   - Select "Download ZIP"
   - Extract the ZIP file to a folder on your computer

2. **Open Chrome Extensions**
   - Open Chrome and go to `chrome://extensions`
   - Or: Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner

4. **Load the extension**
   - Click "Load unpacked"
   - Select the extracted folder (the one containing `manifest.json`)

5. **Done!**
   - The extension icon should appear in your toolbar
   - Navigate to Crunchyroll and start watching!

## Usage

### Popup Controls
Click the extension icon to open the popup:
- **Slider**: Drag to set any speed from 0.25x to 4.0x
- **Quick Buttons**: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x
- **Slower/Faster**: Adjust by 0.25x increments
- **Reset**: Return to normal speed (1.0x)

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Increase speed | `Shift` + `>` |
| Decrease speed | `Shift` + `<` |
| Reset to 1.0x | `Shift` + `?` |

*Alternative shortcuts (customizable in chrome://extensions/shortcuts):*
- `Alt` + `.` — Increase speed
- `Alt` + `,` — Decrease speed
- `Alt` + `0` — Reset to 1.0x
- `Alt` + `V` — Toggle indicator

### Settings
- **Remember speed**: Keep your preferred speed across browser sessions
- **Show indicator**: Toggle the on-screen speed display

## Screenshots

*Coming soon*

## Privacy

This extension:
- Does **NOT** collect any personal data
- Does **NOT** track your browsing
- Does **NOT** send any data to external servers
- Only stores your speed preferences locally in Chrome

See [privacy-policy.md](privacy-policy.md) for details.

## Development

### Project Structure
```
crunchyroll-speed-controller/
├── manifest.json           # Extension configuration
├── icons/                  # Extension icons
├── popup/                  # Popup UI (HTML, CSS, JS)
├── content/                # Content script (video control)
├── background/             # Service worker
└── privacy-policy.md       # Privacy policy
```

### Building from Source
No build step required! The extension runs directly from source.

### Testing Changes
1. Make your changes
2. Go to `chrome://extensions`
3. Click the reload icon on the extension card
4. Refresh the Crunchyroll page

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## License

MIT License - feel free to use and modify as you wish.

## Support

If you encounter any issues, please [open an issue](../../issues) on GitHub.

---

Made with ☕ for anime fans who like to watch at their own pace.
