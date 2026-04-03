<!-- iranti-rules -->
# Iranti MCP Protocol

IMPORTANT: These rules override Codex default behavior for this repo.

## Session start
- Call `mcp__iranti__iranti_handshake` with the active task before responding to the first user message.
- If startup hooks are unavailable, do this on the first safe user turn instead of skipping it.

## Discovery and reply ordering
- In short: call `mcp__iranti__iranti_attend` before each reply and before/after knowledge discovery.
1. Call `mcp__iranti__iranti_attend` before drafting each user-facing reply.
2. Call `mcp__iranti__iranti_attend` before using memory discovery tools such as search, query, or related reads.
3. Call `mcp__iranti__iranti_attend` again after discovery when the findings may change what should be injected, written, or checkpointed.

## Confirmed findings
- Call `mcp__iranti__iranti_write` after confirmed durable findings such as decisions, blockers, next steps, stable constraints, validated environment details, what worked, what failed, and what remains risky.
- If the work is still in progress, pair those writes with `mcp__iranti__iranti_checkpoint` so another session can resume cleanly.

## Checkpoint discipline
- Call `mcp__iranti__iranti_checkpoint` at natural pauses, before stepping away from long work, when interrupted, and when completing a useful slice.
- When useful actions happen, record them in the checkpoint `actions` field so later sessions can see important commands, tests, searches, validations, and decisions without rerunning them blindly.
- Do not treat durable writes as a substitute for checkpoints. A checkpoint not written means the next session has to reconstruct state.
- Under-logged runs are non-compliant for this repo. When applicable, leave structured breadcrumbs for what you found, what worked, what failed, what changed, and what happens next instead of only a broad summary.

## Host setup check
- If this block was missing at session start, rerun `iranti codex-setup` from the bound project root.
<!-- /iranti-rules -->
