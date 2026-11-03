function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatInlineMarkdown(text) {
    return text
        .split(/(`[^`\n]*`)/g)
        .map((part) => {
            if (part.startsWith('`') && part.endsWith('`')) {
                return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
            }

            return escapeHtml(part)
                .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
                .replace(/\*(.+?)\*/g, '<b>$1</b>');
        })
        .join('');
}

function splitTableRow(line) {
    const cells = [];
    let cell = '';
    let escaped = false;

    for (const character of line.trim()) {
        if (character === '|' && !escaped) {
            cells.push(cell.trim());
            cell = '';
        } else {
            cell += character;
        }

        escaped = character === '\\' && !escaped;
        if (character !== '\\') {
            escaped = false;
        }
    }

    cells.push(cell.trim());
    if (cells[0] === '') cells.shift();
    if (cells.at(-1) === '') cells.pop();
    return cells.map((value) => value.replaceAll('\\|', '|'));
}

function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableRow(line) {
    return line.includes('|');
}

function formatTable(headers, rows) {
    return rows.map((row) => {
        const fields = headers
            .map((header, index) => {
                const value = row[index] ?? '';
                if (!value) return '';
                return index === 0
                    ? `<b>${formatInlineMarkdown(value)}</b>`
                    : `<b>${formatInlineMarkdown(header)}:</b> ${formatInlineMarkdown(value)}`;
            })
            .filter(Boolean);

        return fields.length ? `• ${fields.join(' · ')}` : '';
    }).filter(Boolean).join('\n');
}

export function formatTelegramMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const formattedLines = [];
    let codeLines = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (codeLines !== null) {
            if (/^\s*```/.test(line)) {
                formattedLines.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = null;
            } else {
                codeLines.push(line);
            }
            continue;
        }

        if (/^\s*```/.test(line)) {
            codeLines = [];
            continue;
        }

        if (isTableRow(line) && lines[index + 1] && isTableSeparator(lines[index + 1])) {
            const headers = splitTableRow(line);
            const rows = [];
            index += 2;
            while (index < lines.length && isTableRow(lines[index]) && lines[index].trim()) {
                rows.push(splitTableRow(lines[index]));
                index++;
            }
            index--;
            formattedLines.push(formatTable(headers, rows));
            continue;
        }

        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
        formattedLines.push(
            heading ? `<b>${formatInlineMarkdown(heading[1])}</b>` : formatInlineMarkdown(line),
        );
    }

    if (codeLines !== null) {
        formattedLines.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    return splitTelegramHtml(formattedLines.join('\n'));
}

function splitTelegramHtml(html, maxVisibleCharacters = 3900) {
    const tokens = html.match(/<[^>]+>|&(?:amp|lt|gt|quot|#39);|[\s\S]/gu) ?? [];
    const chunks = [];
    const openTags = [];
    let current = '';
    let visibleCharacters = 0;

    for (const token of tokens) {
        const tag = token.match(/^<(\/?)(\w+)>$/);
        if (tag) {
            current += token;
            if (tag[1]) {
                openTags.pop();
            } else {
                openTags.push(`<${tag[2]}>`);
            }
            continue;
        }

        if (visibleCharacters === maxVisibleCharacters) {
            current += openTags.slice().reverse().map((openTag) => `</${openTag.slice(1, -1)}>`).join('');
            chunks.push(current);
            current = openTags.join('');
            visibleCharacters = 0;
        }

        current += token;
        visibleCharacters++;
    }

    if (current) {
        current += openTags.slice().reverse().map((openTag) => `</${openTag.slice(1, -1)}>`).join('');
        chunks.push(current);
    }

    return chunks.length ? chunks : [''];
}
