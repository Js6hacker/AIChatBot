import { Buffer } from 'node:buffer';

export function buildRequestMessages(history, currentMessage, systemPrompt, maxContentBytes) {
    let remainingBytes = maxContentBytes - Buffer.byteLength(systemPrompt, 'utf8');
    const currentMessageBytes = Buffer.byteLength(currentMessage, 'utf8');
    const truncationNotice = '\n[Message shortened to fit the model request limit.]';
    const currentMessageTruncated = currentMessageBytes > remainingBytes;
    const boundedCurrentMessage = currentMessageTruncated
        ? `${truncateToUtf8Bytes(currentMessage, remainingBytes - Buffer.byteLength(truncationNotice, 'utf8'))}${truncationNotice}`
        : currentMessage;
    remainingBytes -= Buffer.byteLength(boundedCurrentMessage, 'utf8');

    const recentHistory = [];
    let historyTruncated = false;
    for (let index = history.length - 1; index >= 0 && remainingBytes > 0; index--) {
        const historicalMessage = history[index];
        const content = truncateToUtf8Bytes(historicalMessage.content, remainingBytes);
        if (!content) {
            historyTruncated = true;
            break;
        }

        recentHistory.unshift({ role: historicalMessage.role, content });
        remainingBytes -= Buffer.byteLength(content, 'utf8');
        if (content.length < historicalMessage.content.length) {
            historyTruncated = true;
            break;
        }
    }
    if (recentHistory.length < history.length) {
        historyTruncated = true;
    }

    return {
        messages: [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: boundedCurrentMessage },
        ],
        currentMessageTruncated,
        historyTruncated,
    };
}

function truncateToUtf8Bytes(text, maxBytes) {
    let result = '';
    let bytes = 0;

    for (const character of text) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (bytes + characterBytes > maxBytes) {
            break;
        }
        result += character;
        bytes += characterBytes;
    }

    return result;
}
