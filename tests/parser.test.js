'use strict';
// Tests for the pure (non-DOMParser) functions in lib/parser.js.
// DOMParser-dependent functions (parseRichText, htmlToMarkdown) are in richtext.test.js.

// Provide a stub DOMParser so the require() doesn't throw. The stub is
// never called by the functions tested here.
global.DOMParser = class {
  parseFromString() { return { body: null }; }
};

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseInline, stripInlineSyntax, parseMarkdown, cleanNodeArray,
  escapeHtml, applyInlineHtml, nodesToHtml, looksLikeMarkdown,
} = require('../lib/parser.js');

// ─── parseInline ────────────────────────────────────────────────────────────

describe('parseInline', () => {
  test('plain text returns single text node', () => {
    const nodes = parseInline('hello world');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'text');
    assert.equal(nodes[0].content, 'hello world');
    assert.equal(nodes[0].bold, false);
    assert.equal(nodes[0].italic, false);
    assert.equal(nodes[0].underline, false);
  });

  test('**bold** produces bold node', () => {
    const nodes = parseInline('say **hello** now');
    const bold = nodes.find(n => n.bold);
    assert.ok(bold, 'no bold node found');
    assert.equal(bold.content, 'hello');
  });

  test('*italic* produces italic node', () => {
    const nodes = parseInline('say *hello* now');
    const italic = nodes.find(n => n.italic);
    assert.ok(italic);
    assert.equal(italic.content, 'hello');
  });

  test('__underline__ produces underline node', () => {
    const nodes = parseInline('__under__');
    assert.equal(nodes[0].underline, true);
    assert.equal(nodes[0].content, 'under');
  });

  test('`code` is passed through as plain text', () => {
    const nodes = parseInline('use `npm install`');
    const code = nodes.find(n => n.content === 'npm install');
    assert.ok(code);
    assert.equal(code.bold, false);
    assert.equal(code.italic, false);
  });

  test('mixed bold and italic in same string', () => {
    const nodes = parseInline('**bold** and *italic*');
    const bold = nodes.find(n => n.bold);
    const italic = nodes.find(n => n.italic);
    assert.ok(bold);
    assert.ok(italic);
    assert.equal(bold.content, 'bold');
    assert.equal(italic.content, 'italic');
  });

  test('empty string returns empty array', () => {
    const nodes = parseInline('');
    assert.equal(nodes.length, 0);
  });

  test('whitespace-only string produces no meaningful content (cleanNodeArray filters it)', () => {
    // parseInline may return a whitespace node; cleanNodeArray removes it.
    const nodes = parseInline('   ');
    const meaningful = nodes.filter(n => n.content && n.content.trim().length > 0);
    assert.equal(meaningful.length, 0);
  });

  test('baseFormatting is inherited by plain segments', () => {
    const nodes = parseInline('hello', { bold: true });
    assert.equal(nodes[0].bold, true);
    assert.equal(nodes[0].content, 'hello');
  });
});

// ─── stripInlineSyntax ──────────────────────────────────────────────────────

describe('stripInlineSyntax', () => {
  test('strips **bold**', () => {
    assert.equal(stripInlineSyntax('**hello**'), 'hello');
  });
  test('strips *italic*', () => {
    assert.equal(stripInlineSyntax('*hi*'), 'hi');
  });
  test('strips __underline__', () => {
    assert.equal(stripInlineSyntax('__under__'), 'under');
  });
  test('strips `code`', () => {
    assert.equal(stripInlineSyntax('`code`'), 'code');
  });
  test('leaves plain text unchanged', () => {
    assert.equal(stripInlineSyntax('plain'), 'plain');
  });
  test('strips multiple markers in one string', () => {
    assert.equal(stripInlineSyntax('**a** and *b*'), 'a and b');
  });
});

// ─── cleanNodeArray ─────────────────────────────────────────────────────────

describe('cleanNodeArray', () => {
  test('removes consecutive breaks', () => {
    const input = [
      { type: 'text', content: 'a' },
      { type: 'break', level: 'paragraph' },
      { type: 'break', level: 'paragraph' },
      { type: 'text', content: 'b' },
    ];
    const result = cleanNodeArray(input);
    const breaks = result.filter(n => n.type === 'break');
    assert.equal(breaks.length, 1);
  });

  test('trims leading breaks', () => {
    const input = [
      { type: 'break', level: 'paragraph' },
      { type: 'text', content: 'hello' },
    ];
    const result = cleanNodeArray(input);
    assert.equal(result[0].type, 'text');
  });

  test('trims trailing breaks', () => {
    const input = [
      { type: 'text', content: 'hello' },
      { type: 'break', level: 'paragraph' },
    ];
    const result = cleanNodeArray(input);
    assert.equal(result[result.length - 1].type, 'text');
  });

  test('removes text nodes with empty content', () => {
    const input = [
      { type: 'text', content: '   ' },
      { type: 'text', content: 'real' },
    ];
    const result = cleanNodeArray(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].content, 'real');
  });

  test('preserves listitem nodes regardless of content', () => {
    const input = [
      { type: 'listitem', content: 'item', listType: 'bullet', isFirst: true, inlineSegments: [] },
    ];
    const result = cleanNodeArray(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'listitem');
  });

  test('empty input returns empty array', () => {
    assert.deepEqual(cleanNodeArray([]), []);
  });
});

// ─── parseMarkdown ──────────────────────────────────────────────────────────

describe('parseMarkdown', () => {
  test('empty string returns empty array', () => {
    assert.deepEqual(parseMarkdown(''), []);
  });

  test('plain paragraph produces text node(s)', () => {
    const nodes = parseMarkdown('Hello world.');
    assert.ok(nodes.length > 0);
    assert.ok(nodes.every(n => n.type === 'text' || n.type === 'break'));
    const text = nodes.filter(n => n.type === 'text').map(n => n.content).join('');
    assert.ok(text.includes('Hello world'));
  });

  test('# heading produces heading node', () => {
    const nodes = parseMarkdown('# My Title\n\nParagraph.');
    const heading = nodes.find(n => n.type === 'heading');
    assert.ok(heading, 'no heading node');
    assert.equal(heading.level, 1);
    assert.equal(heading.content, 'My Title');
  });

  test('## heading has level 2', () => {
    const nodes = parseMarkdown('## Sub\n\nText.');
    const heading = nodes.find(n => n.type === 'heading');
    assert.equal(heading.level, 2);
  });

  test('heading content strips inline syntax', () => {
    const nodes = parseMarkdown('# **Bold** Title');
    const heading = nodes.find(n => n.type === 'heading');
    assert.equal(heading.content, 'Bold Title');
  });

  test('bullet list produces listitem nodes', () => {
    const nodes = parseMarkdown('- alpha\n- beta\n- gamma');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items.length, 3);
    assert.ok(items.every(n => n.listType === 'bullet'));
  });

  test('first bullet item has isFirst=true, rest false', () => {
    const nodes = parseMarkdown('- one\n- two\n- three');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items[0].isFirst, true);
    assert.equal(items[1].isFirst, false);
    assert.equal(items[2].isFirst, false);
  });

  test('numbered list produces numbered listitem nodes', () => {
    const nodes = parseMarkdown('1. first\n2. second');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items.length, 2);
    assert.ok(items.every(n => n.listType === 'numbered'));
  });

  test('two paragraphs separated by blank line produce a break', () => {
    const nodes = parseMarkdown('Para one.\n\nPara two.');
    const breaks = nodes.filter(n => n.type === 'break');
    assert.ok(breaks.length >= 1);
  });

  test('no leading or trailing breaks', () => {
    const nodes = parseMarkdown('Hello.');
    assert.ok(nodes[0].type !== 'break');
    assert.ok(nodes[nodes.length - 1].type !== 'break');
  });

  test('inline bold in paragraph', () => {
    const nodes = parseMarkdown('This is **important**.');
    const bold = nodes.find(n => n.bold);
    assert.ok(bold);
    assert.equal(bold.content, 'important');
  });

  test('multiple sentences in paragraph produce sentence breaks', () => {
    const nodes = parseMarkdown('First sentence. Second sentence.');
    const breaks = nodes.filter(n => n.type === 'break' && n.level === 'sentence');
    assert.ok(breaks.length >= 1);
  });

  test('HTML tags are stripped from input', () => {
    const nodes = parseMarkdown('<b>bold</b> plain');
    // Should not have literal angle-bracket characters in output
    const allContent = nodes.filter(n => n.content).map(n => n.content).join('');
    assert.ok(!allContent.includes('<b>'));
  });

  test('HTML entity &amp; decoded', () => {
    const nodes = parseMarkdown('AT&amp;T');
    const allContent = nodes.filter(n => n.content).map(n => n.content).join('');
    assert.ok(allContent.includes('AT&T'));
  });

  test('horizontal rule treated as paragraph break', () => {
    const nodes = parseMarkdown('before\n\n---\n\nafter');
    const breaks = nodes.filter(n => n.type === 'break');
    assert.ok(breaks.length >= 1);
  });

  test('heading followed by text has break between them', () => {
    const nodes = parseMarkdown('# Title\n\nBody text.');
    const headingIdx = nodes.findIndex(n => n.type === 'heading');
    assert.ok(headingIdx >= 0);
    // After the heading there should be a break node
    const afterHeading = nodes[headingIdx + 1];
    assert.ok(afterHeading && afterHeading.type === 'break');
  });

  test('list followed by paragraph has break between them', () => {
    const nodes = parseMarkdown('- item one\n- item two\n\nRegular paragraph.');
    const lastItem = [...nodes].reverse().find(n => n.type === 'listitem');
    const lastItemIdx = nodes.lastIndexOf(lastItem);
    const afterList = nodes.slice(lastItemIdx + 1);
    const hasBreak = afterList.some(n => n.type === 'break');
    assert.ok(hasBreak);
  });
});

// ─── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes &', () => assert.equal(escapeHtml('a & b'), 'a &amp; b'));
  test('escapes <', () => assert.equal(escapeHtml('<tag>'), '&lt;tag&gt;'));
  test('escapes >', () => assert.equal(escapeHtml('a > b'), 'a &gt; b'));
  test('plain text unchanged', () => assert.equal(escapeHtml('hello'), 'hello'));
  test('null/undefined returns empty string', () => assert.equal(escapeHtml(null), ''));
});

// ─── applyInlineHtml ─────────────────────────────────────────────────────────

describe('applyInlineHtml', () => {
  test('plain node returns escaped text', () => {
    assert.equal(applyInlineHtml({ content: 'hello', bold: false, italic: false, underline: false }), 'hello');
  });
  test('bold wraps in <strong>', () => {
    assert.equal(applyInlineHtml({ content: 'hi', bold: true, italic: false, underline: false }), '<strong>hi</strong>');
  });
  test('italic wraps in <em>', () => {
    assert.equal(applyInlineHtml({ content: 'hi', bold: false, italic: true, underline: false }), '<em>hi</em>');
  });
  test('underline wraps in <u>', () => {
    assert.equal(applyInlineHtml({ content: 'hi', bold: false, italic: false, underline: true }), '<u>hi</u>');
  });
  test('bold + italic wraps in both tags', () => {
    const result = applyInlineHtml({ content: 'hi', bold: true, italic: true, underline: false });
    assert.ok(result.includes('<strong>'));
    assert.ok(result.includes('<em>'));
    assert.ok(result.includes('hi'));
  });
  test('HTML-unsafe content in node is escaped', () => {
    const result = applyInlineHtml({ content: 'a<b', bold: false, italic: false, underline: false });
    assert.ok(result.includes('&lt;'));
    assert.ok(!result.includes('<b'));
  });
});

// ─── looksLikeMarkdown ───────────────────────────────────────────────────────

describe('looksLikeMarkdown', () => {
  test('# heading detected', () => assert.ok(looksLikeMarkdown('# Title\n\nBody.')));
  test('## heading detected', () => assert.ok(looksLikeMarkdown('## Sub')));
  test('- bullet detected', () => assert.ok(looksLikeMarkdown('- item one\n- item two')));
  test('* bullet detected', () => assert.ok(looksLikeMarkdown('* item')));
  test('1. numbered list detected', () => assert.ok(looksLikeMarkdown('1. first\n2. second')));
  test('**bold** detected', () => assert.ok(looksLikeMarkdown('This is **bold** text.')));
  test('__underline__ detected', () => assert.ok(looksLikeMarkdown('This is __underlined__.')));
  test('plain prose not detected', () => assert.ok(!looksLikeMarkdown('Just a normal sentence here.')));
  test('single asterisk not detected (avoids false positives)', () => {
    assert.ok(!looksLikeMarkdown('multiply 3 * 4 = 12'));
  });
  test('empty string not detected', () => assert.ok(!looksLikeMarkdown('')));
});

// ─── nodesToHtml ─────────────────────────────────────────────────────────────

describe('nodesToHtml', () => {
  test('empty array returns empty string', () => {
    assert.equal(nodesToHtml([]), '');
  });

  test('single text node becomes <p>', () => {
    const nodes = parseMarkdown('Hello world.');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<p>'));
    assert.ok(html.includes('Hello world'));
  });

  test('heading node becomes <h1>', () => {
    const nodes = parseMarkdown('# My Title');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<h1>My Title</h1>'));
  });

  test('heading level 2 becomes <h2>', () => {
    const nodes = parseMarkdown('## Sub');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<h2>Sub</h2>'));
  });

  test('bullet list becomes <ul><li>', () => {
    const nodes = parseMarkdown('- alpha\n- beta');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<ul>'));
    assert.ok(html.includes('<li>alpha</li>'));
    assert.ok(html.includes('<li>beta</li>'));
  });

  test('numbered list becomes <ol><li>', () => {
    const nodes = parseMarkdown('1. first\n2. second');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<ol>'));
    assert.ok(html.includes('<li>first</li>'));
  });

  test('bold inline becomes <strong>', () => {
    const nodes = parseMarkdown('This is **important** text.');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<strong>important</strong>'));
  });

  test('italic inline becomes <em>', () => {
    const nodes = parseMarkdown('This is *italic* text.');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<em>italic</em>'));
  });

  test('multiple paragraphs each wrapped in <p>', () => {
    const nodes = parseMarkdown('First paragraph.\n\nSecond paragraph.');
    const html = nodesToHtml(nodes);
    const pCount = (html.match(/<p>/g) || []).length;
    assert.ok(pCount >= 2, `expected 2+ <p> tags, got ${pCount}`);
  });

  test('heading followed by paragraph has both tags', () => {
    const nodes = parseMarkdown('# Title\n\nBody text.');
    const html = nodesToHtml(nodes);
    assert.ok(html.includes('<h1>'));
    assert.ok(html.includes('<p>'));
  });

  test('HTML-unsafe content is escaped in output', () => {
    const nodes = parseMarkdown('less than < greater than >');
    const html = nodesToHtml(nodes);
    assert.ok(!html.includes('< ') || html.includes('&lt;'));
  });

  test('round-trip: parseMarkdown → nodesToHtml preserves structure', () => {
    const md = '# Heading\n\nParagraph with **bold**.\n\n- item one\n- item two';
    const html = nodesToHtml(parseMarkdown(md));
    assert.ok(html.includes('<h1>'));
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<ul>'));
    assert.ok(html.includes('<li>item one</li>'));
  });
});
