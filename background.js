importScripts('lib/timing.js');

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// KNOWN LIMITATION (MV3 service worker lifecycle):
// isPaused and pauseResolve are module-level variables. Chrome MV3 service
// workers can be terminated after ~30 seconds of inactivity. If the worker
// is killed while typing is paused, these variables reset to their defaults
// (isPaused=false, pauseResolve=null) on the next wake. The pause is silently
// lost and typing will not resume from where it left off. The typeText handler
// always resets all state at start to prevent stale values from a prior run
// causing a deadlock on the next run. Persisting paused state via
// chrome.storage.session is not practical here because the typing Promise
// chain cannot survive a worker restart; a restart inherently loses execution
// context. The mitigation is: keep typing sessions short enough that the
// worker stays alive, and rely on the stop/restart flow if a session is lost.
let shouldStop = false;
let isPaused = false;
let pauseResolve = null;

function pauseTyping() {
  if (isPaused) return;
  isPaused = true;
  console.log('[HumanType] PAUSED');
  try {
    chrome.runtime.sendMessage({ action: 'typePaused' });
  } catch (e) {}
}

function resumeTyping() {
  if (!isPaused) return;
  isPaused = false;
  console.log('[HumanType] RESUMED');
  try {
    chrome.runtime.sendMessage({ action: 'typeResumed' });
  } catch (e) {}
  if (pauseResolve) {
    pauseResolve();
    pauseResolve = null;
  }
}

async function checkPause() {
  if (!isPaused) return;
  await new Promise(resolve => {
    pauseResolve = resolve;
  });
}

// Live profile reference — can be swapped mid-session by the switchProfile message handler.
// typeString re-reads this at each character iteration so a switch takes effect immediately
// on the next char (pauses, typo rate, burst behavior). WPM/baseDelay are sampled once per
// typeString call for consistency within a single word burst.
let currentProfile = PROFILES.casual;

const ENABLE_TYPOS = true;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Returns true for characters that cannot be produced with a single standard
// keypress — e.g. em dashes, curly quotes, non-breaking spaces, and other
// Unicode symbols that require alt codes, composition sequences, or copy-paste.
// A realistic typist pauses before producing these, so we insert a small delay.
function isSpecialChar(c) {
  const code = c.codePointAt(0);
  if (code >= 0x20 && code <= 0x7E) return false; // printable ASCII: directly typeable
  if (code === 0x0A) return false;                 // newline: handled as Enter key
  return true;
}

async function typeChar(tabId, char) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'char',
    text: char,
    unmodifiedText: char,
  });
}

async function pressEnter(tabId) {
  const params = {
    type: 'rawKeyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    modifiers: 0,
  };

  try {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', params);
    await wait(50);
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      ...params,
      type: 'keyUp',
    });
    await wait(80);
    console.log('[HumanType] pressEnter OK');
  } catch (e) {
    console.warn('[HumanType] pressEnter failed, retrying:', e.message);
    await wait(200);
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', params);
      await wait(50);
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        ...params,
        type: 'keyUp',
      });
      await wait(80);
      console.log('[HumanType] pressEnter retry OK');
    } catch (e2) {
      console.error('[HumanType] pressEnter retry also failed:', e2.message);
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: '\n' });
        console.log('[HumanType] pressEnter fallback insertText OK');
      } catch (e3) {
        console.error('[HumanType] pressEnter all methods failed:', e3.message);
      }
    }
  }
}

async function pressBackspace(tabId) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
    modifiers: 0,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
    modifiers: 0,
  });
  await wait(30);
}

async function sendCtrlShortcut(tabId, key, keyCode) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key, code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key, code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 0,
  });
  await wait(60);
}

async function setFormat(tabId, flag, value, formatState) {
  if (formatState[flag] === value) return;
  formatState[flag] = value;

  const shortcuts = {
    bold: { key: 'b', keyCode: 66 },
    italic: { key: 'i', keyCode: 73 },
    underline: { key: 'u', keyCode: 85 },
  };
  const s = shortcuts[flag];
  await wait(skewedRand(100, 250)); // hesitation before modifier key
  await sendCtrlShortcut(tabId, s.key, s.keyCode);
  await wait(skewedRand(80, 150)); // confirmation pause after shortcut
  console.log(`[HumanType] FORMAT: ${flag} → ${value}`);
}

async function resetToNormal(tabId) {
  const key = '0';
  const keyCode = 48;
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Alt', code: 'AltLeft',
    windowsVirtualKeyCode: 18, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key, code: `Digit${key}`,
    windowsVirtualKeyCode: keyCode, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key, code: `Digit${key}`,
    windowsVirtualKeyCode: keyCode, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Alt', code: 'AltLeft',
    windowsVirtualKeyCode: 18, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, modifiers: 0,
  });
  await wait(300);
  console.log('[HumanType] Reset to Normal');
}

async function applyHeading(tabId, level) {
  await wait(skewedRand(250, 500)); // typist pauses to decide on heading level
  const key = String(level);
  const keyCode = 48 + level;
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Alt', code: 'AltLeft',
    windowsVirtualKeyCode: 18, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key, code: `Digit${key}`,
    windowsVirtualKeyCode: keyCode, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key, code: `Digit${key}`,
    windowsVirtualKeyCode: keyCode, modifiers: 3,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Alt', code: 'AltLeft',
    windowsVirtualKeyCode: 18, modifiers: 2,
  });
  await wait(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, modifiers: 0,
  });
  await wait(500);
  console.log(`[HumanType] H${level} applied`);
}

async function exitList(tabId) {
  await pressEnter(tabId);
  await wait(100);
  await pressEnter(tabId);
  await wait(150);
  console.log('[HumanType] List exited');
}

async function typeString(tabId, text, profile, stats) {
  const wpm = clampedNormal(profile.wpmMean, profile.wpmStd, profile.wpmMin, profile.wpmMax);
  const baseDelay = wpmToDelay(wpm);
  const wordStarts = new Map();
  let localWordIndex = 0;

  for (const match of text.matchAll(/\S+/g)) {
    wordStarts.set(match.index ?? 0, localWordIndex);
    localWordIndex++;
  }

  // Pre-scan: decide which indices will fire a typo before the loop starts.
  // Doing this upfront lets us apply a pre-error IKI slowdown to i-1 and i-2,
  // matching research showing unconscious hesitation before errors in proficient typists.
  // Gate on ENABLE_TYPOS so the scan is skipped when typos are disabled.
  const errorIndices = new Set();
  if (ENABLE_TYPOS) {
    for (let j = 0; j < text.length; j++) {
      const c = text[j];
      if (c.trim() !== '' && c !== '\n' && Math.random() < profile.typoRate) {
        errorIndices.add(j);
      }
    }
  }

  // Burst/coast state machine — alternates between fast burst and baseline coast phases.
  // Burst phase: characters are typed faster (multiplier 0.55–0.70).
  // Coast phase: characters are typed at or slightly above baseline (multiplier 1.0–1.3).
  let burstPhase = Math.random() < profile.burstProbability;
  let phaseRemaining = burstPhase
    ? randBetween(profile.burstLengthMin, profile.burstLengthMax)
    : randBetween(3, 8);

  let skipNext = false; // used by transposition typo to skip the already-typed char
  let lateDetectPending = false;
  let lateDetectRemaining = 0;
  let lateDetectCount = 0;

  for (let i = 0; i < text.length; i++) {
    if (shouldStop) break;
    profile = currentProfile; // re-read live profile each char so mid-session switch takes effect
    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Late-detection correction: a wrong char was typed N chars ago and the typist
    // is only noticing now. Backspace all the way back and retype correctly.
    if (lateDetectPending) {
      lateDetectRemaining--;
      if (lateDetectRemaining <= 0) {
        lateDetectPending = false;
        await wait(skewedRand(profile.typoCorrectionPauseMin, profile.typoCorrectionPauseMax));
        const totalBackspaces = lateDetectCount;
        for (let b = 0; b < totalBackspaces; b++) {
          if (shouldStop) break;
          await pressBackspace(tabId);
          await wait(skewedRand(40, 100));
        }
        await wait(profile.postCorrectionPause);
        const retypeStart = Math.max(0, i - (totalBackspaces - 1));
        for (let r = retypeStart; r <= i; r++) {
          if (shouldStop) break;
          await typeChar(tabId, text[r]);
          await wait(jitterDelay(baseDelay, profile));
        }
        lateDetectCount = 0;
        await wait(Math.max(jitterDelay(baseDelay, profile), 10));
        continue;
      } else {
        lateDetectCount++;
      }
    }
    const char = text[i];
    await checkPause();

    if (
      stats.currentNodeIndex !== null &&
      !/\s/.test(char) &&
      (i === 0 || /\s/.test(text[i - 1]))
    ) {
      const wordIndex = wordStarts.get(i);
      if (wordIndex !== undefined) {
        try {
          chrome.runtime.sendMessage({
            action: 'highlight',
            nodeIndex: stats.currentNodeIndex,
            wordIndex: stats.currentWordOffset + wordIndex,
          });
        } catch (e) {}
      }
    }

    // Per-character IKI jitter applied first, before any phase multipliers
    let delay = jitterDelay(baseDelay, profile);

    // Burst/coast phase multiplier
    if (burstPhase) {
      delay = Math.round(delay * randBetween(55, 70) / 100);
    } else {
      delay = Math.round(delay * randBetween(100, 130) / 100);
    }

    // Advance phase and flip when exhausted
    phaseRemaining--;
    if (phaseRemaining <= 0) {
      if (shouldStop) break;
      burstPhase = !burstPhase;
      phaseRemaining = burstPhase
        ? randBetween(profile.burstLengthMin, profile.burstLengthMax)
        : randBetween(3, 8);
    }

    // Pre-space deceleration: slow down on the character just before a word boundary
    const isPreSpace = i + 1 < text.length && text[i + 1] === ' ';
    if (isPreSpace) {
      delay = Math.round(delay * 1.3);
    }

    // Pre-error IKI slowdown: 2 keystrokes before a scheduled error are slightly slower.
    // Research shows unconscious motor hesitation before errors in proficient typists.
    if (errorIndices.has(i + 1) || errorIndices.has(i + 2)) {
      delay = Math.round(delay * (1.15 + Math.random() * 0.10));
    }

    // Word boundary handling: word pause + optional thinking pause
    if (char === ' ') {
      await wait(skewedRand(profile.wordPauseMin, profile.wordPauseMax));
      if (Math.random() < profile.thinkingPauseChance) {
        await wait(skewedRand(300, 1200));
      }
    }

    // Typo model: adjacency substitution (50%), transposition (25%), double-press (25%)
    if (errorIndices.has(i)) {
      const errorRoll = Math.random();

      if (errorRoll < 0.50 && ADJACENCY_MAP[char.toLowerCase()]) {
        const neighbors = ADJACENCY_MAP[char.toLowerCase()];
        const wrong = neighbors[Math.floor(Math.random() * neighbors.length)];

        if (Math.random() < profile.lateDetectionProbability) {
          // Late detection: type the wrong char now, continue typing normally,
          // notice N chars later and backspace back to fix it.
          await typeChar(tabId, wrong);
          await wait(Math.max(delay, 10));
          lateDetectPending = true;
          lateDetectRemaining = 2 + Math.floor(Math.random() * 3); // notice after 2–4 more chars
          lateDetectCount = 1; // the wrong char itself counts as 1
          stats.typoCount++;
          continue; // skip normal typeChar below
        }

        // Immediate correction (existing behavior)
        await typeChar(tabId, wrong);
        await wait(skewedRand(profile.typoCorrectionPauseMin, profile.typoCorrectionPauseMax));
        await pressBackspace(tabId);
        await wait(profile.postCorrectionPause);
        stats.typoCount++;

      } else if (errorRoll < 0.75 && i + 1 < text.length && text[i + 1].trim() !== '') {
        // Transposition: type char[i+1] first, then char[i], producing a swapped pair.
        // Then backspace both, retype in correct order.
        // skipNext prevents char[i+1] from being typed again on the next iteration.
        const nextChar = text[i + 1];
        await typeChar(tabId, nextChar); // wrong order: next char first
        await wait(skewedRand(20, 60));
        await typeChar(tabId, char);    // then current char — pair is now transposed
        await wait(skewedRand(profile.typoCorrectionPauseMin, profile.typoCorrectionPauseMax));
        await pressBackspace(tabId);   // remove char[i]
        await wait(40);
        await pressBackspace(tabId);   // remove char[i+1]
        await wait(40);
        // Type both in correct order
        await typeChar(tabId, char);
        await wait(randBetween(20, 50));
        await typeChar(tabId, nextChar);
        await wait(profile.postCorrectionPause);
        stats.typoCount++;
        skipNext = true; // char[i+1] already typed above — skip it on next loop iteration
        await wait(Math.max(delay, 10));
        continue; // skip the normal typeChar(tabId, char) below — char[i] already typed

      } else if (errorRoll >= 0.75) {
        // Double-press: type the character twice, immediately backspace the duplicate
        await typeChar(tabId, char); // duplicate press
        await wait(skewedRand(30, 80));
        await pressBackspace(tabId); // correct the double-press
        await wait(profile.postCorrectionPause);
        stats.typoCount++;
        // Fall through — the normal typeChar below types the character correctly
      }
      // Note: if the transposition guard fails (i+1 out of bounds or next char is
      // whitespace) and errorRoll was in 0.50–0.74, no error fires — the typo is
      // silently suppressed. This is intentional: avoid transposing across whitespace
      // or at end of string. Only errorRoll >= 0.75 reliably hits double-press.
    }

    // Extra pause before characters that require a special input method on real
    // hardware (alt codes, dead keys, composition sequences). The debugger API
    // delivers them instantaneously, but a human typist would visibly hesitate.
    if (isSpecialChar(char)) {
      await wait(skewedRand(200, 450));
    }
    await typeChar(tabId, char);
    await wait(Math.max(delay, 10));
  }
}

async function typeNodes(tabId, nodes, profileKey) {
  if (!nodes || !Array.isArray(nodes)) {
    console.error('[HumanType] typeNodes called with invalid nodes:', nodes);
    return { startTime: Date.now(), endTime: Date.now(), typoCount: 0 };
  }

  currentProfile = PROFILES[profileKey] || PROFILES.casual;
  let profile = currentProfile;
  const formatState = { bold: false, italic: false, underline: false };
  let listActive = false;
  let charsTyped = 0;
  const stats = {
    startTime: Date.now(),
    endTime: null,
    typoCount: 0,
    currentNodeIndex: null,
    currentWordOffset: 0,
  };

  const totalChars = nodes.reduce((sum, n) => {
    if (n.type === 'text' || n.type === 'heading' || n.type === 'listitem') {
      return sum + (n.content?.length || 0);
    }
    return sum;
  }, 0);

  await resetToNormal(tabId);
  formatState.bold = false;
  formatState.italic = false;
  formatState.underline = false;

  console.log('[HumanType] Full node array:');
  nodes.forEach((n, i) => {
    if (n.type === 'break') {
      console.log(`  [${i}] BREAK(${n.level})`);
    } else {
      console.log(`  [${i}] ${n.type}: "${(n.content || '').substring(0, 50)}"`);
    }
  });

  for (let i = 0; i < nodes.length; i++) {
    if (shouldStop) break;
    profile = currentProfile; // re-read live profile on each node boundary
    const node = nodes[i];
    console.log(`[HumanType] Processing node [${i}]: ${node.type}${node.level ? '(' + node.level + ')' : ''}`);
    await checkPause();

    if (node.type === 'break') {
      if (node.level === 'sentence') {
        const pause = skewedRand(profile.sentencePauseMin, profile.sentencePauseMax);
        await wait(pause);
        await typeChar(tabId, ' ');
      } else if (node.level === 'paragraph') {
        if (listActive) {
          await exitList(tabId);
          listActive = false;
          await resetToNormal(tabId);
          formatState.bold = false;
          formatState.italic = false;
          formatState.underline = false;
        }
        await setFormat(tabId, 'bold', false, formatState);
        await setFormat(tabId, 'italic', false, formatState);
        await setFormat(tabId, 'underline', false, formatState);
        const pause = skewedRand(profile.paragraphPauseMin, profile.paragraphPauseMax);
        await wait(pause);
        await pressEnter(tabId);
        await wait(180);
      }
      continue;
    }

    if (node.type === 'heading') {
      stats.currentNodeIndex = i;
      stats.currentWordOffset = 0;
      if (listActive) {
        await exitList(tabId);
        listActive = false;
      }
      await setFormat(tabId, 'bold', false, formatState);
      await setFormat(tabId, 'italic', false, formatState);
      await setFormat(tabId, 'underline', false, formatState);
      await applyHeading(tabId, node.level);
      await wait(500);
      await typeString(tabId, node.content, profile, stats);
      charsTyped += node.content.length;
      const headingPercent = Math.round((charsTyped / totalChars) * 100);
      try { chrome.runtime.sendMessage({ action: 'progress', percent: headingPercent }); } catch (e) {}
      await pressEnter(tabId);
      await wait(200);
      await resetToNormal(tabId);
      formatState.bold = false;
      formatState.italic = false;
      formatState.underline = false;
      continue;
    }

    if (node.type === 'listitem') {
      stats.currentNodeIndex = i;
      stats.currentWordOffset = 0;
      console.log('[HumanType] LISTITEM node received:', JSON.stringify(node));
      console.log('[HumanType] listActive:', listActive, '| content:', node.content, '| isFirst:', node.isFirst);

      if (!node.content?.trim()) {
        console.log('[HumanType] LISTITEM skipped — empty content');
        continue;
      }

      if (!listActive) {
        listActive = true;
        if (node.listType === 'bullet') {
          await typeChar(tabId, '-');
          await wait(100);
          await typeChar(tabId, ' ');
          await wait(400);
        } else {
          await typeChar(tabId, '1');
          await wait(80);
          await typeChar(tabId, '.');
          await wait(80);
          await typeChar(tabId, ' ');
          await wait(400);
        }
      } else {
        await pressEnter(tabId);
        await wait(skewedRand(120, 280));
      }

      if (node.inlineSegments && node.inlineSegments.length > 0) {
        for (const seg of node.inlineSegments) {
          if (!seg.content?.trim()) continue;
          await setFormat(tabId, 'bold', !!seg.bold, formatState);
          await setFormat(tabId, 'italic', !!seg.italic, formatState);
          await setFormat(tabId, 'underline', !!seg.underline, formatState);
          await typeString(tabId, seg.content, profile, stats);
          stats.currentWordOffset += countWordTokens(seg.content);
          charsTyped += seg.content.length;
        }
        await setFormat(tabId, 'bold', false, formatState);
        await setFormat(tabId, 'italic', false, formatState);
        await setFormat(tabId, 'underline', false, formatState);
      } else {
        await typeString(tabId, node.content, profile, stats);
        charsTyped += node.content.length;
      }
      const listitemPercent = Math.round((charsTyped / totalChars) * 100);
      try { chrome.runtime.sendMessage({ action: 'progress', percent: listitemPercent }); } catch (e) {}
      continue;
    }

    if (node.type === 'text') {
      if (!node.content?.trim()) continue;
      stats.currentNodeIndex = i;
      stats.currentWordOffset = 0;
      await setFormat(tabId, 'bold', !!node.bold, formatState);
      await setFormat(tabId, 'italic', !!node.italic, formatState);
      await setFormat(tabId, 'underline', !!node.underline, formatState);
      await typeString(tabId, node.content, profile, stats);
      charsTyped += node.content.length;
      const percent = Math.round((charsTyped / totalChars) * 100);
      try { chrome.runtime.sendMessage({ action: 'progress', percent }); } catch (e) {}
      continue;
    }
  }

  if (listActive) await exitList(tabId);
  await setFormat(tabId, 'bold', false, formatState);
  await setFormat(tabId, 'italic', false, formatState);
  await setFormat(tabId, 'underline', false, formatState);

  stats.endTime = Date.now();
  stats.totalChars = totalChars;
  const elapsedMinutes = (stats.endTime - stats.startTime) / 60000;
  stats.avgWpm = elapsedMinutes > 0
    ? Math.round((totalChars / 5) / elapsedMinutes)
    : 0;
  return stats;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'stopTyping') {
    shouldStop = true;
    // If typing is currently paused, the async chain is suspended inside
    // checkPause() waiting on pauseResolve. We must unblock it so the loop
    // can observe shouldStop, exit, and reach the finally block that detaches
    // the debugger. Without this call, pause-then-stop causes a deadlock.
    if (isPaused) resumeTyping();
    return;
  }

  if (request.action === 'pauseTyping') {
    pauseTyping();
    return;
  }

  if (request.action === 'resumeTyping') {
    resumeTyping();
    return;
  }

  if (request.action === 'togglePause') {
    if (isPaused) resumeTyping();
    else pauseTyping();
    return;
  }

  if (request.action === 'switchProfile') {
    if (PROFILES[request.profileId]) currentProfile = PROFILES[request.profileId];
    return;
  }

  if (request.action === 'typeText') {
    shouldStop = false;
    isPaused = false;
    pauseResolve = null;
    // Build custom profile from professional base + caller-supplied overrides.
    // Must be set before typeNodes() resolves PROFILES[profileKey].
    if (request.profileId === 'custom' && request.customProfile) {
      PROFILES.custom = { ...PROFILES.professional, ...request.customProfile };
    }
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab.id;

      try {
        await chrome.debugger.attach({ tabId }, '1.3');
        const stats = await typeNodes(tabId, request.nodes, request.profileId);
        try { chrome.runtime.sendMessage({ action: 'progress', percent: 100 }); } catch (e) {}
        sendResponse({ success: !shouldStop, stopped: shouldStop, stats });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      } finally {
        isPaused = false;
        if (pauseResolve) {
          pauseResolve();
          pauseResolve = null;
        }
        try {
          await chrome.debugger.detach({ tabId });
        } catch (e) {}
      }
    })();
    return true;
  }
});
