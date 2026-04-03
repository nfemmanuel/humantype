// lib/parser.js — markdown and rich-text parsers, node utilities.
// Loaded via <script> in popup.html and require()'d in tests.
// Uses DOMParser for rich-text paths — must be available in the calling context.
// Node.TEXT_NODE (3) and Node.ELEMENT_NODE (1) are inlined to avoid depending
// on the DOM Node global, which makes this file testable in Node.js with jsdom.

function parseInline(text, baseFormatting) {
  const base = { bold: false, italic: false, underline: false, ...baseFormatting };
  const nodes = [];
  // Match priority (order matters to avoid single-* consuming **bold** or single-_ consuming __underline__):
  //   match[1] = **bold**
  //   match[2] = *italic* (single asterisk)
  //   match[3] = __underline__ (double underscore)
  //   match[4] = _italic_ (single underscore, standard markdown)
  //   match[5] = `code` — passed through as plain text
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_|`(.+?)`/gs;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) nodes.push({ type: 'text', content: plain, ...base });
    }
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', content: match[1], bold: true, italic: base.italic, underline: base.underline });
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', content: match[2], bold: base.bold, italic: true, underline: base.underline });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', content: match[3], bold: base.bold, italic: base.italic, underline: true });
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'text', content: match[4], bold: base.bold, italic: true, underline: base.underline });
    } else if (match[5] !== undefined) {
      nodes.push({ type: 'text', content: match[5], ...base });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) nodes.push({ type: 'text', content: remaining, ...base });
  }

  if (nodes.length === 0 && text.trim()) {
    nodes.push({ type: 'text', content: text, ...base });
  }

  return nodes;
}

function stripInlineSyntax(text) {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/`(.+?)`/gs, '$1');
}

function parseMarkdown(rawText) {
  const text = rawText
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = text.split('\n');
  const nodes = [];
  let inList = false;
  let listType = null;
  let isFirstItem = true;
  let pendingParaBreak = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      if (inList) {
        inList = false;
        listType = null;
        isFirstItem = true;
      }
      pendingParaBreak = true;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { inList = false; isFirstItem = true; }
      if (pendingParaBreak && nodes.length > 0) {
        nodes.push({ type: 'break', level: 'paragraph' });
        pendingParaBreak = false;
      }
      nodes.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: stripInlineSyntax(headingMatch[2].trim()),
      });
      nodes.push({ type: 'break', level: 'paragraph' });
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      nodes.push({ type: 'break', level: 'paragraph' });
      pendingParaBreak = false;
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      if (pendingParaBreak && nodes.length > 0) {
        nodes.push({ type: 'break', level: 'paragraph' });
        pendingParaBreak = false;
      }
      if (!inList || listType !== 'bullet') {
        if (inList) nodes.push({ type: 'break', level: 'paragraph' });
        inList = true;
        listType = 'bullet';
        isFirstItem = true;
      }
      const rawContent = bulletMatch[1].trim();
      const cleanContent = stripInlineSyntax(rawContent) || rawContent;
      nodes.push({
        type: 'listitem',
        listType: 'bullet',
        isFirst: isFirstItem,
        content: cleanContent,
        inlineSegments: parseInline(rawContent),
      });
      isFirstItem = false;
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numberedMatch) {
      if (pendingParaBreak && nodes.length > 0) {
        nodes.push({ type: 'break', level: 'paragraph' });
        pendingParaBreak = false;
      }
      if (!inList || listType !== 'numbered') {
        if (inList) nodes.push({ type: 'break', level: 'paragraph' });
        inList = true;
        listType = 'numbered';
        isFirstItem = true;
      }
      const rawContent = numberedMatch[2].trim();
      const cleanContent = stripInlineSyntax(rawContent) || rawContent;
      nodes.push({
        type: 'listitem',
        listType: 'numbered',
        isFirst: isFirstItem,
        content: cleanContent,
        inlineSegments: parseInline(rawContent),
      });
      isFirstItem = false;
      continue;
    }

    if (inList) {
      inList = false;
      isFirstItem = true;
      nodes.push({ type: 'break', level: 'paragraph' });
    }

    if (pendingParaBreak && nodes.length > 0) {
      nodes.push({ type: 'break', level: 'paragraph' });
      pendingParaBreak = false;
    }

    const sentences = trimmed
      .split(/(?<=[.!?…])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (let s = 0; s < sentences.length; s++) {
      const inlineNodes = parseInline(sentences[s]);
      nodes.push(...inlineNodes);
      if (s < sentences.length - 1) {
        nodes.push({ type: 'break', level: 'sentence' });
      }
    }
  }

  return cleanNodeArray(nodes);
}

function parseRichText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nodes = [];
  let lastNodeWasBreak = false;

  function detectBold(el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'b' || tag === 'strong') return true;
    const style = el.style;
    if (!style) return false;
    const fw = style.fontWeight;
    if (fw === 'bold' || fw === 'bolder') return true;
    if (parseInt(fw) >= 600) return true;
    return false;
  }

  function detectItalic(el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'i' || tag === 'em') return true;
    if (el.style?.fontStyle === 'italic') return true;
    return false;
  }

  function detectUnderline(el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'u') return true;
    const td = el.style?.textDecoration || el.style?.textDecorationLine || '';
    if (td.includes('underline')) return true;
    return false;
  }

  function pushBreak(level) {
    if (lastNodeWasBreak) return;
    if (nodes.length === 0) return;
    nodes.push({ type: 'break', level });
    lastNodeWasBreak = true;
  }

  function pushText(content, fmt) {
    if (!content || !content.trim()) return;
    nodes.push({
      type: 'text',
      content,
      bold: !!fmt.bold,
      italic: !!fmt.italic,
      underline: !!fmt.underline,
    });
    lastNodeWasBreak = false;
  }

  function walk(node, fmt) {
    if (node.nodeType === 3) { // TEXT_NODE
      const content = node.textContent;
      if (content && content.trim()) pushText(content, fmt);
      return;
    }

    if (node.nodeType !== 1) return; // not ELEMENT_NODE

    const tag = node.tagName.toLowerCase();

    if (['script', 'style', 'meta', 'head', 'link'].includes(tag)) return;

    const childFmt = {
      bold: fmt.bold || detectBold(node),
      italic: fmt.italic || detectItalic(node),
      underline: fmt.underline || detectUnderline(node),
    };

    if (/^h[1-6]$/.test(tag)) {
      pushBreak('paragraph');
      const level = parseInt(tag[1]);
      const headingText = (node.innerText || node.textContent || '').trim();
      if (headingText) {
        nodes.push({ type: 'heading', level, content: headingText });
        lastNodeWasBreak = false;
      }
      pushBreak('paragraph');
      return;
    }

    if (tag === 'li') {
      const parentTag = node.parentElement?.tagName?.toLowerCase();
      const listType = parentTag === 'ol' ? 'numbered' : 'bullet';
      const isFirst = node.parentElement
        ? Array.from(node.parentElement.children).indexOf(node) === 0
        : true;
      const itemText = (node.innerText || node.textContent || '').trim();
      if (itemText) {
        nodes.push({
          type: 'listitem',
          listType,
          isFirst,
          content: itemText,
          inlineSegments: parseInline(itemText, childFmt),
        });
        lastNodeWasBreak = false;
      }
      return;
    }

    const blockTags = new Set(['p', 'div', 'section', 'article', 'blockquote', 'header', 'footer', 'main', 'aside']);
    if (blockTags.has(tag)) {
      if (nodes.length > 0 && !lastNodeWasBreak) pushBreak('paragraph');
      for (const child of node.childNodes) walk(child, childFmt);
      pushBreak('paragraph');
      return;
    }

    if (tag === 'br') { pushBreak('paragraph'); return; }

    if (tag === 'ul' || tag === 'ol') {
      for (const child of node.childNodes) walk(child, childFmt);
      pushBreak('paragraph');
      return;
    }

    for (const child of node.childNodes) walk(child, childFmt);
  }

  walk(doc.body, { bold: false, italic: false, underline: false });

  return cleanNodeArray(nodes);
}

function cleanNodeArray(nodes) {
  let result = nodes;

  result = result.filter(n => {
    if (n.type === 'text') return n.content && n.content.trim().length > 0;
    if (n.type === 'listitem') return true;
    if (n.type === 'heading') return n.content && n.content.trim().length > 0;
    return true;
  });

  result = result.filter((node, i) => {
    if (node.type !== 'break') return true;
    const prev = result[i - 1];
    return !prev || prev.type !== 'break';
  });

  while (result.length > 0 && result[0].type === 'break') result.shift();
  while (result.length > 0 && result[result.length - 1].type === 'break') result.pop();

  return result;
}

// Converts clipboard HTML to markdown syntax.
function htmlToMarkdown(htmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');

  function extractInline(node) {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { // TEXT_NODE
        out += child.textContent;
      } else if (child.nodeType === 1) { // ELEMENT_NODE
        const tag = child.tagName.toLowerCase();
        const inner = extractInline(child);
        if (tag === 'b' || tag === 'strong') {
          out += inner ? `**${inner}**` : '';
        } else if (tag === 'i' || tag === 'em') {
          out += inner ? `*${inner}*` : '';
        } else if (tag === 'u') {
          out += inner ? `__${inner}__` : '';
        } else if (tag === 'br') {
          out += '\n';
        } else {
          out += inner;
        }
      }
    }
    return out;
  }

  function walkBlock(node, lines) {
    if (node.nodeType === 3) { // TEXT_NODE
      const text = node.textContent.trim();
      if (text) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        lines.push(text);
        lines.push('');
      }
      return;
    }
    if (node.nodeType !== 1) return; // not ELEMENT_NODE

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'head', 'meta', 'link'].includes(tag)) return;

    const headingMatch = tag.match(/^h([1-6])$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1]);
      const text = extractInline(node).trim();
      if (text) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        lines.push('#'.repeat(level) + ' ' + text);
        lines.push('');
      }
      return;
    }

    if (tag === 'p') {
      const text = extractInline(node).trim();
      if (text) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        lines.push(text);
        lines.push('');
      }
      return;
    }

    if (tag === 'ul') {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      for (const child of node.childNodes) {
        if (child.tagName?.toLowerCase() === 'li') {
          const text = extractInline(child).trim();
          if (text) lines.push('- ' + text);
        }
      }
      lines.push('');
      return;
    }

    if (tag === 'ol') {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      let n = 1;
      for (const child of node.childNodes) {
        if (child.tagName?.toLowerCase() === 'li') {
          const text = extractInline(child).trim();
          if (text) { lines.push(`${n}. ` + text); n++; }
        }
      }
      lines.push('');
      return;
    }

    if (tag === 'br') {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      return;
    }

    if (tag === 'li') return;

    if (tag === 'hr') { lines.push(''); return; }

    const blockContainers = new Set(['div', 'section', 'article', 'blockquote',
      'header', 'footer', 'main', 'aside', 'body', 'td', 'th']);
    if (blockContainers.has(tag)) {
      for (const child of node.childNodes) walkBlock(child, lines);
      return;
    }

    const text = extractInline(node).trim();
    if (text) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      lines.push(text);
      lines.push('');
    }
  }

  const lines = [];
  walkBlock(doc.body, lines);

  return lines.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Rich-text output helpers ────────────────────────────────────────────────
// Used when pasting markdown source into the rich-text editor to convert the
// parsed node tree back into HTML suitable for execCommand('insertHTML').

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyInlineHtml(node) {
  let text = escapeHtml(node.content);
  // Apply wrappers inside-out so the outermost tag is the block-level one.
  if (node.underline) text = `<u>${text}</u>`;
  if (node.italic)    text = `<em>${text}</em>`;
  if (node.bold)      text = `<strong>${text}</strong>`;
  return text;
}

function countWordTokens(text) {
  const matches = (text || '').match(/\S+/g);
  return matches ? matches.length : 0;
}

function renderInlineHtmlWithWordSpans(node, nodeIndex, wordIndexStart = 0) {
  const text = node?.content || '';
  let html = '';
  let cursor = 0;
  let wordIndex = wordIndexStart;

  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    const word = match[0];

    html += escapeHtml(text.slice(cursor, start));

    let wordHtml = `<span data-ni="${nodeIndex}" data-wi="${wordIndex}">${escapeHtml(word)}</span>`;
    if (node?.underline) wordHtml = `<u>${wordHtml}</u>`;
    if (node?.italic) wordHtml = `<em>${wordHtml}</em>`;
    if (node?.bold) wordHtml = `<strong>${wordHtml}</strong>`;

    html += wordHtml;
    cursor = start + word.length;
    wordIndex++;
  }

  html += escapeHtml(text.slice(cursor));
  return { html, nextWordIndex: wordIndex };
}

// Convert a clean node array (output of parseMarkdown) to an HTML string.
// Paragraph breaks flush both open paragraph and open list buffers.
// Sentence breaks become a single space inside the current paragraph.
function nodesToHtml(nodes) {
  let html = '';
  let paraBuffer = '';
  let listItems = [];
  let listType = null;

  function flushList() {
    if (!listItems.length) return;
    const tag = listType === 'numbered' ? 'ol' : 'ul';
    html += `<${tag}>${listItems.map(c => `<li>${c}</li>`).join('')}</${tag}>`;
    listItems = [];
    listType = null;
  }

  function flushPara() {
    if (!paraBuffer.trim()) { paraBuffer = ''; return; }
    html += `<p>${paraBuffer}</p>`;
    paraBuffer = '';
  }

  for (const node of nodes) {
    if (node.type === 'heading') {
      flushList();
      flushPara();
      html += `<h${node.level}>${escapeHtml(node.content)}</h${node.level}>`;
    } else if (node.type === 'listitem') {
      flushPara();
      if (listType && listType !== node.listType) flushList();
      listType = node.listType;
      const content = node.inlineSegments?.length
        ? node.inlineSegments.map(applyInlineHtml).join('')
        : escapeHtml(node.content);
      listItems.push(content);
    } else if (node.type === 'break' && node.level === 'paragraph') {
      flushList();
      flushPara();
    } else if (node.type === 'break' && node.level === 'sentence') {
      paraBuffer += ' ';
    } else if (node.type === 'text') {
      flushList();
      paraBuffer += applyInlineHtml(node);
    }
  }
  flushList();
  flushPara();
  return html;
}

// Returns true when pasted plain text appears to use markdown conventions.
// Used in rich-text mode to decide whether to parse and convert before inserting.
// Deliberately conservative: only triggers on unambiguous structural markers
// (headings, lists, **bold**, __underline__) to avoid false positives on text
// that happens to contain asterisks or underscores.
function looksLikeMarkdown(text) {
  return (
    /(?:^|\n)#{1,6} /.test(text) ||   // # Heading
    /(?:^|\n)[-*+] /.test(text) ||    // - bullet list
    /(?:^|\n)\d+\. /.test(text) ||    // 1. numbered list
    /\*\*[^*\n]+\*\*/.test(text) ||   // **bold**
    /__[^_\n]+__/.test(text)          // __underline__
  );
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseInline, stripInlineSyntax, parseMarkdown, parseRichText, cleanNodeArray,
    htmlToMarkdown, escapeHtml, applyInlineHtml, countWordTokens,
    renderInlineHtmlWithWordSpans, nodesToHtml, looksLikeMarkdown,
  };
}
