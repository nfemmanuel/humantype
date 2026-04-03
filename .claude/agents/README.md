# Shared Agent Operating System

## Common Tools
All agents should use these aggressively when relevant:
- fast repo navigation and targeted file reads
- extension architecture review across `manifest.json`, `popup.html`, `popup.js`, `background.js`, and `content.js`
- manual smoke testing in Chrome after extension reload
- structured notes for risks, assumptions, and user-visible behavior changes

## Common Working Rules
1. Read `CLAUDE.md` before making meaningful changes.
2. Read both ends of any shared contract before editing one side.
3. Keep the repo dependency-light and directly editable.
4. Treat manifest permissions and debugger usage as high-risk surfaces.
5. Update `README.md` when setup, permissions, controls, or visible behavior change.
6. Report manual verification performed and residual risks.

## Common Deliverables
- concrete implementation or review output
- explicit tradeoffs
- testing notes
- open questions and known risks
- acceptance check against the requested behavior

## Completion Protocol
Before calling work complete, every agent should confirm:
1. Changed files still align with the current message and node contracts.
2. The extension can be reloaded without manifest errors.
3. Impacted flows were manually smoke-tested in Chrome when feasible.
4. Any untested area is stated plainly instead of implied away.

