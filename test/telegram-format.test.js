import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTelegramMarkdown } from '../telegram-format.js';

test('formats common inline Markdown syntax for Telegram HTML', () => {
    assert.deepEqual(
        formatTelegramMarkdown('**bold** __also bold__ _italic_ ~~removed~~ [link](https://example.com)'),
        ['<b>bold</b> <b>also bold</b> <i>italic</i> <s>removed</s> <a href="https://example.com">link</a>'],
    );
});

test('formats Markdown lists and blockquotes without exposing their markers', () => {
    assert.deepEqual(
        formatTelegramMarkdown('- first item\n> quoted text'),
        ['• first item\n❯ quoted text'],
    );
});

test('keeps fenced code literal and escapes HTML', () => {
    assert.deepEqual(
        formatTelegramMarkdown('```html\n<b>literal</b>\n```'),
        ['<pre><code>&lt;b&gt;literal&lt;/b&gt;</code></pre>'],
    );
});
