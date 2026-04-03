# Chrome Web Store — Debugger Permission Justification

Use this text when prompted to justify the `debugger` permission during submission.

---

## Justification

HumanType uses the `debugger` API exclusively to simulate realistic keyboard input into the currently focused text field via the Chrome DevTools Protocol (CDP).

**Why the `debugger` API is required:**

Simulating human typing requires dispatching real keyboard events — including key-down, key-press, and key-up sequences — with precise timing and modifier key support (e.g., Ctrl+B for bold, Ctrl+I for italic, Enter for line breaks). JavaScript's `dispatchEvent` API is not sufficient for this purpose because:

1. Framework-controlled inputs (React, Vue, Angular) intercept only trusted, browser-generated events. Synthetic events dispatched via JavaScript are ignored by these frameworks, so text does not appear.
2. Rich-text editors such as Google Docs rely on the browser's native input pipeline and do not respond to `dispatchEvent`-based keystroke simulation.
3. Modifier key combinations (used for formatting shortcuts) cannot be reliably simulated without CDP's `Input.dispatchKeyEvent`.

The `debugger` API is the only available mechanism that generates trusted, native-equivalent keyboard events across all supported field types.

**Scope of use:**

- The debugger is attached only to the active tab, only when the user explicitly clicks "Type It" to begin a session.
- It is detached immediately when typing completes, when the user clicks Stop, or when an error occurs.
- The extension does not use the debugger API to inspect, modify, or intercept page content, network traffic, or any user data.
- No data leaves the user's device. All content remains local.
