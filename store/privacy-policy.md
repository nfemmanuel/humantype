# Privacy Policy — HumanType

*Last updated: 2026-03-29*

## Overview

HumanType is a Chrome extension that types user-provided content into web text fields with realistic human timing. This policy describes what data the extension does and does not collect.

## Data Collection

HumanType does not collect, transmit, store, or share any personal data or user content.

- **Content you type into the editor** stays entirely on your device. It is never sent to any server.
- **The pages you visit** are not tracked, logged, or reported.
- **No analytics, telemetry, or crash reporting** is included in the extension.

## How the Extension Works

HumanType operates entirely locally within your browser:

1. You paste or type content into the extension's side panel.
2. The extension simulates keyboard input into the focused field on the active tab using the Chrome DevTools Protocol (CDP).
3. Once the session ends, no record of the content or the session is retained.

The `debugger` permission is used solely to dispatch keyboard events to the active tab. It is attached at the start of a typing session and detached immediately when the session ends. It is not used to read page content, intercept network requests, or access any user data.

## Third-Party Services

HumanType does not use any third-party services, APIs, or SDKs. There are no external network requests of any kind.

## Changes to This Policy

If this policy changes, the updated version will be published at the same location with a revised date.

## Contact

For questions or concerns, contact: [your contact email or GitHub issues URL]
