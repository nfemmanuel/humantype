// Theme handling
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('i');

const moonSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const sunSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeIcon.innerHTML = theme === 'dark' ? sunSVG : moonSVG;
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  setTheme(theme);
}

themeToggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

initTheme();

// UI elements
const editor = document.getElementById('editor');
const typeBtn = document.getElementById('typeBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const progressTrack = document.getElementById('progressTrack');
const progressFill = document.getElementById('progressFill');
const statsCard = document.getElementById('statsCard');
const toolbar = document.getElementById('toolbar');

let countdownTimer = null;
let typingActive = false;
let currentlyPaused = false;
let inputMode = 'markdown';
let savedEditorContent = null;

// Build a read-only preview of the node array with each typeable chunk wrapped
// in per-word <span data-ni="N" data-wi="W"> wrappers so the highlighter can
// follow the exact word being typed.
function nodesToPreviewHtml(nodes) {
  let html = '';
  let paraBuffer = '';
  let listItems = [];
  let listMeta = null; // { type, startIndex }
  function flushList() {
    if (!listItems.length) return;
    const tag = listMeta.type === 'numbered' ? 'ol' : 'ul';
    html += `<${tag}>${listItems.map(c => `<li>${c}</li>`).join('')}</${tag}>`;
    listItems = [];
    listMeta = null;
  }
  function flushPara() {
    if (!paraBuffer.trim()) { paraBuffer = ''; return; }
    html += `<p>${paraBuffer}</p>`;
    paraBuffer = '';
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'heading') {
      flushList(); flushPara();
      const rendered = renderInlineHtmlWithWordSpans({ content: node.content }, i);
      html += `<h${node.level}>${rendered.html}</h${node.level}>`;
    } else if (node.type === 'listitem') {
      flushPara();
      if (listMeta && listMeta.type !== node.listType) flushList();
      if (!listMeta) listMeta = { type: node.listType };
      let wordIndex = 0;
      const content = node.inlineSegments?.length
        ? node.inlineSegments.map((segment) => {
            const rendered = renderInlineHtmlWithWordSpans(segment, i, wordIndex);
            wordIndex = rendered.nextWordIndex;
            return rendered.html;
          }).join('')
        : renderInlineHtmlWithWordSpans({ content: node.content }, i).html;
      listItems.push(content);
    } else if (node.type === 'break' && node.level === 'paragraph') {
      flushList(); flushPara();
    } else if (node.type === 'break' && node.level === 'sentence') {
      paraBuffer += ' ';
    } else if (node.type === 'text') {
      flushList();
      paraBuffer += renderInlineHtmlWithWordSpans(node, i).html;
    }
  }
  flushList(); flushPara();
  return html;
}

function restoreEditor() {
  if (savedEditorContent !== null) {
    editor.innerHTML = savedEditorContent;
    editor.contentEditable = 'true';
    savedEditorContent = null;
    // Preview HTML replaced the editor — searchMatches refs are now stale
    searchMatches = [];
    searchIndex = -1;
    searchCount.textContent = '';
  }
  // Clear any lingering highlight
  editor.querySelectorAll('.ht-current').forEach(el => el.classList.remove('ht-current'));
}

// --- Search ---
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');
const prevMatch = document.getElementById('prevMatch');
const nextMatch = document.getElementById('nextMatch');
const closeSearchBtn = document.getElementById('closeSearchBtn');

let searchMatches = [];
let searchIndex = -1;

function clearSearchMatches() {
  editor.querySelectorAll('mark.ht-match').forEach(m => {
    m.replaceWith(...Array.from(m.childNodes));
  });
  editor.normalize();
  searchMatches = [];
  searchIndex = -1;
  searchCount.textContent = '';
}

function goToMatch(index) {
  if (!searchMatches.length) return;
  if (searchIndex >= 0 && searchMatches[searchIndex]) {
    searchMatches[searchIndex].classList.remove('ht-match-active');
  }
  searchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
  const active = searchMatches[searchIndex];
  active.classList.add('ht-match-active');
  active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  searchCount.textContent = `${searchIndex + 1}/${searchMatches.length}`;
}

function runSearch(query) {
  clearSearchMatches();
  if (!query || savedEditorContent !== null) return;

  const lquery = query.toLowerCase();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  for (const textNode of textNodes) {
    const text = textNode.textContent;
    const ltext = text.toLowerCase();
    const positions = [];
    let i = 0;
    while ((i = ltext.indexOf(lquery, i)) !== -1) {
      positions.push(i);
      i += lquery.length;
    }
    // Wrap in reverse order so earlier text offsets stay valid
    for (let p = positions.length - 1; p >= 0; p--) {
      const range = document.createRange();
      range.setStart(textNode, positions[p]);
      range.setEnd(textNode, positions[p] + query.length);
      const mark = document.createElement('mark');
      mark.className = 'ht-match';
      range.surroundContents(mark);
      searchMatches.unshift(mark);
    }
  }

  if (searchMatches.length) {
    goToMatch(0);
  } else {
    searchCount.textContent = '0/0';
  }
}

function openSearch() {
  if (savedEditorContent !== null) return; // don't open during typing
  searchBar.classList.add('active');
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  clearSearchMatches();
  searchBar.classList.remove('active');
  editor.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    openSearch();
  }
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSearch(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? goToMatch(searchIndex - 1) : goToMatch(searchIndex + 1);
  }
});
searchInput.addEventListener('input', () => runSearch(searchInput.value));
prevMatch.addEventListener('click', () => goToMatch(searchIndex - 1));
nextMatch.addEventListener('click', () => goToMatch(searchIndex + 1));
closeSearchBtn.addEventListener('click', closeSearch);

// Mode toggle
// Switching modes clears the editor content because markdown and rich-text are parsed
// differently and mixing them would produce unpredictable nodes. The selected typing
// profile is intentionally preserved across mode switches — it reflects the user's
// preferred speed/behaviour, not a per-mode setting.
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    inputMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === inputMode)
    );
    toolbar.style.display = inputMode === 'richtext' ? 'flex' : 'none';
    editor.dataset.placeholder = inputMode === 'markdown'
      ? 'Paste markdown text here... (# H1, **bold**, *italic*, - bullet)'
      : 'Paste formatted text here...';
    editor.innerHTML = '';
  });
});

toolbar.style.display = 'none';
editor.dataset.placeholder = 'Paste markdown text here... (# H1, **bold**, *italic*, - bullet)';

// Toolbar button wiring for rich-text mode.
// All commands use execCommand — same caveats as the paste handler above (deprecated
// in spec but fully functional in Chrome extension contexts for contenteditable).
document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => {
    // Prevent the editor from losing focus when clicking a toolbar button.
    e.preventDefault();
    const command = btn.dataset.command;
    document.execCommand(command, false, null);
    editor.focus();
  });
});

// Style select: wraps the selected block in a heading or paragraph tag.
const styleSelect = document.getElementById('styleSelect');
if (styleSelect) {
  styleSelect.addEventListener('change', () => {
    document.execCommand('formatBlock', false, styleSelect.value);
    editor.focus();
  });
}

// Font size select: applies an inline font size to the current selection.
// Resets to the placeholder after each use so it acts as a one-shot command.
const fontSizeSelect = document.getElementById('fontSizeSelect');
if (fontSizeSelect) {
  fontSizeSelect.addEventListener('change', () => {
    const size = fontSizeSelect.value;
    if (size) {
      document.execCommand('fontSize', false, size);
    }
    fontSizeSelect.value = '';
    editor.focus();
  });
}

// Clear-formatting button: strips inline formatting from the selection.
const clearBtn = document.getElementById('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand('removeFormat', false, null);
    editor.focus();
  });
}

// htmlToMarkdown, parseInline, stripInlineSyntax, parseMarkdown, parseRichText,
// and cleanNodeArray are defined in lib/parser.js, loaded before this script.

// Paste handler
// Note: document.execCommand('insertText') and document.execCommand('insertHTML') are
// technically deprecated in the Web spec, but remain fully functional in Chrome's extension
// context (side panel / popup) where no alternative API provides equivalent caret-aware
// insertion into a contenteditable. Do not remove these calls without a verified replacement.
editor.addEventListener('paste', (e) => {
  e.preventDefault();
  if (inputMode === 'markdown') {
    const htmlData = e.clipboardData.getData('text/html');
    if (htmlData) {
      // Convert HTML to markdown so headings paste as # syntax, paragraphs get
      // blank-line separation (required for paragraph break nodes), and inline
      // formatting becomes **bold** / *italic* / __underline__.
      const markdown = htmlToMarkdown(htmlData);
      document.execCommand('insertText', false, markdown || e.clipboardData.getData('text/plain'));
    } else {
      const plain = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, plain);
    }
  } else {
    // Rich-text mode: use clipboard HTML directly when available (preserves
    // formatting from Google Docs, browsers, etc.). If the clipboard only has
    // plain text but it looks like markdown source (e.g. pasted from a markdown
    // editor), parse it and insert as formatted HTML so the editor shows actual
    // bold/headings/lists rather than raw syntax.
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (html) {
      document.execCommand('insertHTML', false, html);
    } else if (plain && looksLikeMarkdown(plain)) {
      const richHtml = nodesToHtml(parseMarkdown(plain));
      document.execCommand('insertHTML', false, richHtml || plain);
    } else {
      document.execCommand('insertText', false, plain);
    }
  }
});

// Profile selection
const profileCards = document.querySelectorAll('.profile-card');
const profileHintName = document.getElementById('profile-hint-name');
const profileHintMeta = document.getElementById('profile-hint-meta');
let selectedProfile = 'casual';

function setHint(card) {
  profileHintName.textContent = card.dataset.name;
  profileHintMeta.textContent = card.dataset.meta;
}

// Initialise hint to the default selected card
setHint(document.querySelector('.profile-card.active'));

profileCards.forEach(card => {
  card.addEventListener('mouseenter', () => setHint(card));
  card.addEventListener('mouseleave', () => setHint(document.querySelector('.profile-card.active')));

  card.addEventListener('click', () => {
    profileCards.forEach(c => {
      c.classList.remove('active');
      const icon = c.querySelector('i');
      icon.classList.remove('icon-accent');
      icon.classList.add('icon-muted');
    });
    card.classList.add('active');
    const icon = card.querySelector('i');
    icon.classList.remove('icon-muted');
    icon.classList.add('icon-accent');
    selectedProfile = card.dataset.profile;
    setHint(card);
    // Show/hide custom panel
    customPanel.style.display = selectedProfile === 'custom' ? 'flex' : 'none';
    // Don't send switchProfile for custom — the full profile object is built at typing time.
    if (selectedProfile !== 'custom') {
      try { chrome.runtime.sendMessage({ action: 'switchProfile', profileId: selectedProfile }); } catch (e) {}
    }
  });
});

// Custom profile panel wiring
const customPanel = document.getElementById('customPanel');
const customWpmInput = document.getElementById('customWpm');
const customWpmValue = document.getElementById('customWpmValue');
const customErrorInput = document.getElementById('customError');
const customErrorValue = document.getElementById('customErrorValue');
const customVariabilityInput = document.getElementById('customVariability');
const customVariabilityValue = document.getElementById('customVariabilityValue');

function variabilityLabel(v) {
  if (v <= 20) return 'Steady';
  if (v <= 40) return 'Low';
  if (v <= 60) return 'Med';
  if (v <= 80) return 'High';
  return 'Erratic';
}

customWpmInput.addEventListener('input', () => {
  customWpmValue.textContent = customWpmInput.value + ' WPM';
});
customErrorInput.addEventListener('input', () => {
  customErrorValue.textContent = parseFloat(customErrorInput.value).toFixed(1) + '%';
});
customVariabilityInput.addEventListener('input', () => {
  customVariabilityValue.textContent = variabilityLabel(parseInt(customVariabilityInput.value));
});

function buildCustomProfile() {
  const wpm = parseInt(customWpmInput.value);
  const errorRate = parseFloat(customErrorInput.value) / 100;
  // v: 0.0 (rock-steady) → 1.0 (very erratic)
  // At v=0.5 (default "Med"): stdFactor≈0.165, range ≈ [wpm*0.65, wpm*1.35] — close to built-in profiles
  const v = parseInt(customVariabilityInput.value) / 100;
  const stdFactor = 0.03 + v * 0.27;            // 3% → 30% of mean WPM
  const rangeFactor = 0.10 + v * 0.50;          // ±10% → ±60% of mean WPM
  return {
    wpmMean: wpm,
    wpmStd: Math.round(wpm * stdFactor),
    wpmMin: Math.max(20, Math.round(wpm * (1 - rangeFactor))),
    wpmMax: Math.round(wpm * (1 + rangeFactor)),
    typoRate: errorRate,
    lateDetectionProbability: 0.20,
  };
}

// Status display
const loaderSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
const checkSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
const alertSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
const circleSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';

function showStatus(type, text, icon) {
  const statusText = document.getElementById('statusText');
  const statusIcon = status.querySelector('i');
  
  status.className = `status show ${type}`;
  statusText.textContent = text;
  
  statusIcon.className = `icon-14 icon-${type === 'success' ? 'success' : type === 'error' ? 'error' : 'muted'}`;
  if (icon === 'loader') statusIcon.classList.add('icon-spin');
  
  if (icon === 'loader') statusIcon.innerHTML = loaderSVG;
  else if (icon === 'check') statusIcon.innerHTML = checkSVG;
  else if (icon === 'alert') statusIcon.innerHTML = alertSVG;
  else statusIcon.innerHTML = circleSVG;
}

function showStats(stats) {
  const secs = Math.round((stats.endTime - stats.startTime) / 1000);
  const timeDisplay = secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs % 60}s`;
  
  document.getElementById('statTime').textContent = timeDisplay;
  document.getElementById('statChars').textContent = stats.totalChars || 0;
  document.getElementById('statWpm').textContent = stats.avgWpm || 0;
  document.getElementById('statTypos').textContent = stats.typoCount || 0;
  
  statsCard.classList.add('show');
}

function hideStats() {
  statsCard.classList.remove('show');
}

// Progress updates and background-driven state reconciliation.
// typePaused / typeResumed come from the background worker and serve as the authoritative
// source of truth. If the local optimistic toggle somehow diverged (e.g. a rapid
// double-click), these messages correct both the flag and the button UI.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'progress') {
    progressTrack.classList.add('active');
    progressFill.style.width = msg.percent + '%';
  }
  if (msg.action === 'typePaused') {
    currentlyPaused = true;
    pauseBtn.classList.add('paused');
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    showStatus('typing', 'Paused', 'circle');
  }
  if (msg.action === 'typeResumed') {
    currentlyPaused = false;
    pauseBtn.classList.remove('paused');
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
    showStatus('typing', 'Typing...', 'loader');
  }
  if (msg.action === 'highlight') {
    const prev = editor.querySelector('.ht-current');
    if (prev) prev.classList.remove('ht-current');
    const next = Number.isInteger(msg.wordIndex)
      ? editor.querySelector(`[data-ni="${msg.nodeIndex}"][data-wi="${msg.wordIndex}"]`)
      : editor.querySelector(`[data-ni="${msg.nodeIndex}"]`);
    if (next) {
      next.classList.add('ht-current');
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
});

// Pause/resume
// Race condition note: the side panel optimistically toggles UI state (currentlyPaused,
// button appearance, status text) before the background worker acknowledges the change.
// The background sends back 'typePaused' / 'typeResumed' messages, which the listener
// above uses to reconcile currentlyPaused. In practice the messages are fast enough that
// the brief divergence is invisible to users. A more rigorous approach would wait for
// the background acknowledgement before updating UI, but that adds latency to every
// pause/resume interaction and the current optimistic approach is the right tradeoff here.
// The listener-driven reconciliation below is the safety net for any missed message.
function togglePause() {
  if (!typingActive) return;
  currentlyPaused = !currentlyPaused;
  if (currentlyPaused) {
    chrome.runtime.sendMessage({ action: 'pauseTyping' });
    pauseBtn.classList.add('paused');
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    showStatus('typing', 'Paused', 'circle');
  } else {
    chrome.runtime.sendMessage({ action: 'resumeTyping' });
    pauseBtn.classList.remove('paused');
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
    showStatus('typing', 'Typing...', 'loader');
  }
}

pauseBtn.addEventListener('click', togglePause);

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'p') {
    e.preventDefault();
    togglePause();
  }
});

// Type button
typeBtn.addEventListener('click', () => {
  const plain = editor.innerText?.trim();
  const html = editor.innerHTML;

  if (!plain) {
    showStatus('error', 'Nothing to type', 'alert');
    return;
  }

  let nodes;
  if (inputMode === 'markdown') {
    nodes = parseMarkdown(plain);
  } else {
    nodes = parseRichText(html);
  }

  console.log(`[HumanType] ${nodes.length} nodes parsed (mode: ${inputMode})`);
  nodes.forEach((n, i) => {
    if (n.type === 'break') {
      console.log(`  [${i}] BREAK(${n.level})`);
    } else {
      console.log(`  [${i}] ${n.type.toUpperCase()}: "${(n.content || '').substring(0, 40)}" bold:${n.bold} italic:${n.italic}`);
    }
  });

  hideStats();
  progressFill.style.width = '0%';
  progressTrack.classList.remove('active');
  
  typingActive = true;
  currentlyPaused = false;
  pauseBtn.disabled = false;
  typeBtn.disabled = true;
  stopBtn.style.display = 'flex';
  
  // 3-second arm window: user must click their target text field before countdown hits 0.
  // The status text counts down visibly so the user knows exactly when typing will begin.
  let countdown = 3;
  showStatus('typing', `Click your target field now... ${countdown}`, 'loader');

  countdownTimer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById('statusText').textContent = `Click your target field now... ${countdown}`;
    } else {
      clearInterval(countdownTimer);
      startTyping(nodes);
    }
  }, 1000);
});

stopBtn.addEventListener('click', () => {
  if (countdownTimer) {
    // Stop was clicked during the arm countdown. Cancelling the interval prevents
    // startTyping() from being called. The stopTyping message is still sent in case
    // the user clicked stop extremely fast after typing had already started.
    // If background hasn't received typeText yet, it will set shouldStop = true;
    // that flag is reset at the top of typeText() so the next invocation is clean.
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  chrome.runtime.sendMessage({ action: 'stopTyping' });
  restoreEditor();
  showStatus('', 'Stopped', 'circle');
  typeBtn.disabled = false;
  stopBtn.style.display = 'none';
  progressTrack.classList.remove('active');
  typingActive = false;
  pauseBtn.disabled = true;
});

function startTyping(nodes) {
  showStatus('typing', 'Typing...', 'loader');

  // Close any open search before capturing editor state — prevents mark elements
  // from being baked into the saved HTML and restored after typing completes.
  closeSearch();

  // Replace editor content with a read-only highlighted preview
  savedEditorContent = editor.innerHTML;
  editor.innerHTML = nodesToPreviewHtml(nodes);
  editor.contentEditable = 'false';

  const msg = { action: 'typeText', nodes, profileId: selectedProfile };
  if (selectedProfile === 'custom') msg.customProfile = buildCustomProfile();

  chrome.runtime.sendMessage(msg, (response) => {
    restoreEditor();

    if (chrome.runtime.lastError) {
      showStatus('error', chrome.runtime.lastError.message, 'alert');
      typeBtn.disabled = false;
      stopBtn.style.display = 'none';
      progressTrack.classList.remove('active');
      return;
    }

    if (response?.success) {
      showStatus('success', 'Done', 'check');
      if (response.stats) {
        showStats(response.stats);
      }
      setTimeout(() => {
        progressTrack.classList.remove('active');
      }, 1000);
    } else if (response?.stopped) {
      showStatus('', 'Stopped', 'circle');
      progressTrack.classList.remove('active');
    } else {
      showStatus('error', response?.error || 'Error occurred', 'alert');
      progressTrack.classList.remove('active');
    }

    typingActive = false;
    currentlyPaused = false;
    pauseBtn.disabled = true;
    pauseBtn.classList.remove('paused');
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';

    typeBtn.disabled = false;
    stopBtn.style.display = 'none';
  });
}
