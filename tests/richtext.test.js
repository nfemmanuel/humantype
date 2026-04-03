'use strict';
// Tests for DOMParser-dependent functions: parseRichText, htmlToMarkdown.
// Uses jsdom to provide DOMParser in the Node.js environment.

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRichText,
  htmlToMarkdown,
  countWordTokens,
  renderInlineHtmlWithWordSpans,
} = require('../lib/parser.js');

// ─── parseRichText ───────────────────────────────────────────────────────────

describe('parseRichText', () => {
  test('empty string returns empty array', () => {
    assert.deepEqual(parseRichText(''), []);
  });

  test('<p> produces text node', () => {
    const nodes = parseRichText('<p>Hello world</p>');
    const text = nodes.find(n => n.type === 'text');
    assert.ok(text, 'no text node found');
    assert.ok(text.content.includes('Hello world'));
  });

  test('<h1> produces heading node with level 1', () => {
    const nodes = parseRichText('<h1>Main Title</h1>');
    const heading = nodes.find(n => n.type === 'heading');
    assert.ok(heading, 'no heading node');
    assert.equal(heading.level, 1);
    assert.ok(heading.content.includes('Main Title'));
  });

  test('<h3> produces heading node with level 3', () => {
    const nodes = parseRichText('<h3>Sub</h3>');
    const heading = nodes.find(n => n.type === 'heading');
    assert.equal(heading.level, 3);
  });

  test('<ul><li> produces bullet listitem nodes', () => {
    const nodes = parseRichText('<ul><li>Alpha</li><li>Beta</li></ul>');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items.length, 2);
    assert.ok(items.every(n => n.listType === 'bullet'));
  });

  test('<ol><li> produces numbered listitem nodes', () => {
    const nodes = parseRichText('<ol><li>First</li><li>Second</li></ol>');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items.length, 2);
    assert.ok(items.every(n => n.listType === 'numbered'));
  });

  test('first list item has isFirst=true', () => {
    const nodes = parseRichText('<ul><li>A</li><li>B</li></ul>');
    const items = nodes.filter(n => n.type === 'listitem');
    assert.equal(items[0].isFirst, true);
    assert.equal(items[1].isFirst, false);
  });

  test('<b> text is marked bold', () => {
    const nodes = parseRichText('<p><b>Bold text</b></p>');
    const bold = nodes.find(n => n.bold);
    assert.ok(bold, 'no bold node');
    assert.ok(bold.content.includes('Bold text'));
  });

  test('<i> text is marked italic', () => {
    const nodes = parseRichText('<p><i>Italic text</i></p>');
    const italic = nodes.find(n => n.italic);
    assert.ok(italic);
    assert.ok(italic.content.includes('Italic text'));
  });

  test('<u> text is marked underline', () => {
    const nodes = parseRichText('<p><u>Under</u></p>');
    const under = nodes.find(n => n.underline);
    assert.ok(under);
  });

  test('<strong> is treated as bold', () => {
    const nodes = parseRichText('<p><strong>Strong</strong></p>');
    const bold = nodes.find(n => n.bold);
    assert.ok(bold);
  });

  test('<em> is treated as italic', () => {
    const nodes = parseRichText('<p><em>Emphasis</em></p>');
    const italic = nodes.find(n => n.italic);
    assert.ok(italic);
  });

  test('multiple paragraphs produce paragraph breaks between them', () => {
    const nodes = parseRichText('<p>One</p><p>Two</p>');
    const breaks = nodes.filter(n => n.type === 'break' && n.level === 'paragraph');
    assert.ok(breaks.length >= 1);
  });

  test('no leading or trailing breaks in result', () => {
    const nodes = parseRichText('<p>Hello</p>');
    assert.ok(nodes.length > 0);
    assert.ok(nodes[0].type !== 'break', `first node is break`);
    assert.ok(nodes[nodes.length - 1].type !== 'break', `last node is break`);
  });

  test('heading and paragraph produce break between them', () => {
    const nodes = parseRichText('<h2>Title</h2><p>Body</p>');
    const headingIdx = nodes.findIndex(n => n.type === 'heading');
    assert.ok(headingIdx >= 0);
    // After heading there should be a break
    const next = nodes[headingIdx + 1];
    assert.ok(next && next.type === 'break');
  });
});

// ─── htmlToMarkdown ──────────────────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  test('<p> becomes plain paragraph text', () => {
    const md = htmlToMarkdown('<p>Hello world</p>');
    assert.ok(md.includes('Hello world'));
    assert.ok(!md.includes('<p>'));
  });

  test('<h1> becomes # heading', () => {
    const md = htmlToMarkdown('<h1>Title</h1>');
    assert.ok(md.startsWith('# Title'));
  });

  test('<h2> becomes ## heading', () => {
    const md = htmlToMarkdown('<h2>Sub</h2>');
    assert.ok(md.startsWith('## Sub'));
  });

  test('<strong> becomes **bold**', () => {
    const md = htmlToMarkdown('<p><strong>bold</strong></p>');
    assert.ok(md.includes('**bold**'));
  });

  test('<b> becomes **bold**', () => {
    const md = htmlToMarkdown('<p><b>bold</b></p>');
    assert.ok(md.includes('**bold**'));
  });

  test('<em> becomes *italic*', () => {
    const md = htmlToMarkdown('<p><em>italic</em></p>');
    assert.ok(md.includes('*italic*'));
  });

  test('<u> becomes __underline__', () => {
    const md = htmlToMarkdown('<p><u>under</u></p>');
    assert.ok(md.includes('__under__'));
  });

  test('<ul><li> becomes - bullet items', () => {
    const md = htmlToMarkdown('<ul><li>Alpha</li><li>Beta</li></ul>');
    assert.ok(md.includes('- Alpha'));
    assert.ok(md.includes('- Beta'));
  });

  test('<ol><li> becomes numbered items', () => {
    const md = htmlToMarkdown('<ol><li>First</li><li>Second</li></ol>');
    assert.ok(md.includes('1. First'));
    assert.ok(md.includes('2. Second'));
  });

  test('no triple+ newlines in output', () => {
    const md = htmlToMarkdown('<p>A</p><p>B</p><p>C</p>');
    assert.ok(!md.includes('\n\n\n'));
  });

  test('empty string returns empty string', () => {
    const md = htmlToMarkdown('');
    assert.equal(md, '');
  });
});

describe('word-level preview helpers', () => {
  test('countWordTokens counts non-whitespace runs', () => {
    assert.equal(countWordTokens('Hello, brave new world'), 4);
    assert.equal(countWordTokens('   '), 0);
  });

  test('renderInlineHtmlWithWordSpans wraps each word with node and word indexes', () => {
    const rendered = renderInlineHtmlWithWordSpans({ content: 'Hello world' }, 7);
    assert.equal(
      rendered.html,
      '<span data-ni="7" data-wi="0">Hello</span> <span data-ni="7" data-wi="1">world</span>'
    );
    assert.equal(rendered.nextWordIndex, 2);
  });

  test('renderInlineHtmlWithWordSpans preserves inline formatting per word', () => {
    const rendered = renderInlineHtmlWithWordSpans(
      { content: 'Bold words', bold: true, italic: true },
      2,
      3
    );
    assert.ok(rendered.html.includes('<strong><em><span data-ni="2" data-wi="3">Bold</span></em></strong>'));
    assert.ok(rendered.html.includes('<strong><em><span data-ni="2" data-wi="4">words</span></em></strong>'));
    assert.equal(rendered.nextWordIndex, 5);
  });
});
