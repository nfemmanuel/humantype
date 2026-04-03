# HumanType

A Chrome extension that types your content into any web text field with realistic human timing, natural pauses, typos, and self-corrections.

## Setup

1. **Generate the icon:**
   - Open `generate-icon.html` in Chrome
   - It will auto-download `icon48.png`
   - Move `icon48.png` into the `icons/` folder

2. **Load the extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `humantype` folder

## Usage

1. Click the HumanType icon in the Chrome toolbar to open the side panel
2. Paste or type your content into the editor
3. Select a typing profile and mode (markdown or rich-text)
4. Click **Type It**
5. You have a 3-second arm window — click into the target text field on the page before the countdown ends
6. HumanType will begin typing into that field automatically

If you need to stop mid-session, click **Stop** in the side panel. To pause and resume, click **Pause** or press **Alt+P**.

## Features

### Typing Profiles

| Profile | Approx. Speed | Typo Rate | Character |
|---|---|---|---|
| Student | ~42 WPM | 2.5% | Casual, learning typist with longer pauses |
| Professional | ~62 WPM | 1% | Steady, experienced office typist |
| Rusher | ~75 WPM | 5% | Fast and sloppy with frequent bursts |
| SpeedBlitz | ~150 WPM | 6% | Elite/competition-level speed |

All profiles simulate variable speed, inter-key timing jitter, thinking pauses, burst typing, and realistic typo-backspace-retype corrections.

### Input Modes

- **Markdown mode:** Paste markdown-formatted text. The extension parses headings, bold, italic, bullet lists, and numbered lists, then types the content with appropriate formatting shortcuts applied.
- **Rich-text mode:** Paste pre-formatted content from another rich-text source. Formatting structure is preserved and replayed.

### Live Node Highlighter

When typing begins, the editor switches to a read-only preview. The segment currently being typed is highlighted in the accent color so you can follow progress. When typing finishes, is stopped, or errors, the editor returns to its normal editable state.

### Find in Editor

Press **Ctrl+F** (or **Cmd+F** on Mac) while the editor has content to open the search bar. All matches are highlighted inline; the active match is highlighted in a distinct color.

- Navigate matches with the **Prev** / **Next** buttons, the ↑ / ↓ arrow buttons, or **Enter** / **Shift+Enter**.
- Press **Escape** or click **×** to close the search bar and clear all highlights.

Find is not available while typing is active.

### Pause and Resume

- Click the **Pause** button in the side panel, or press **Alt+P** on the keyboard, to pause mid-session.
- Click **Resume** (or press **Alt+P** again) to continue from where typing stopped.

### Formatting Support

When typing into a compatible rich-text editor, HumanType applies formatting using keyboard shortcuts (e.g., Ctrl+B for bold, Ctrl+I for italic, heading shortcuts). This works in Google Docs and editors that support the same shortcut conventions.

## Compatibility

- **Plain textareas and input fields:** Text content types correctly. Formatting shortcuts (headings, bold, italic, lists) have no visible effect because plain text fields do not support them — this is expected behavior, not a bug.
- **Rich-text editors (Google Docs and compatible):** Full formatting support including headings, bold, italic, underline, and lists.
- **Framework-controlled inputs (React, Vue, Angular):** Plain text typing works. Formatting behavior depends on the editor implementation.

## Troubleshooting

**The extension typed into the wrong field.**
You clicked a different field than intended during the arm window, or the arm window expired before you clicked. Click **Stop**, reposition your cursor, and run **Type It** again. You have 3 seconds after clicking **Type It** to click the target field.

**Typing started but nothing appeared.**
The debugger may have failed to attach. This can happen if:
- The target tab is a `chrome://` URL or a Chrome Web Store page — the Chrome debugger API cannot attach to these. Use a normal web page.
- Chrome DevTools is already open on the tab. Close DevTools, reload the extension, and try again.

**The session paused and then stopped unexpectedly.**
Chrome MV3 service workers can be terminated after roughly 30 seconds of inactivity. If the worker is killed while typing is paused, the session state is lost and typing will not resume. Use Stop and restart the session. Keep sessions short enough that the service worker stays active, or avoid leaving sessions paused for extended periods.

**Formatting shortcuts did nothing.**
The target editor likely does not support Google Docs-style keyboard shortcuts. Plain text will still have been typed correctly. See the Compatibility section above.
