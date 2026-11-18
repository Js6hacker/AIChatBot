// Building a telegram chat bot using Groq Cloud
import { Bot } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formatTelegramMarkdown } from './telegram-format.js';
import { buildRequestMessages } from './conversation-context.js';
dotenv.config();

const historyFile = fileURLToPath(new URL('./chat-history.json', import.meta.url));
const maxHistoryMessages = 20;
const maxPromptContentBytes = 5000;
const systemPrompt = 'You are a helpful conversational chatbot. Use the conversation history to understand follow-up questions. Format responses with Markdown: use # headings, *single-asterisk* or **double-asterisk** bold, `inline code`, fenced ```code blocks```, and Markdown tables when useful. Keep formatting valid and readable.';
const chatHistory = await loadChatHistory();
let saveQueue = Promise.resolve();
const chatQueues = new Map();

const bot = process.env.BOT_TOKEN ? new Bot(process.env.BOT_TOKEN) : null;
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

async function loadChatHistory() {
    try {
        const contents = await readFile(historyFile, 'utf8');
        const history = JSON.parse(contents);
        if (!history || typeof history !== 'object' || Array.isArray(history)) {
            throw new Error('Chat history file must contain an object.');
        }

        for (const messages of Object.values(history)) {
            if (!Array.isArray(messages) || messages.some((message) =>
                !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
                throw new Error('Chat history file contains an invalid conversation.');
            }
        }
        return history;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

function saveChatHistory() {
    if (process.env.VERCEL) {
        return Promise.resolve();
    }
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        const temporaryFile = `${historyFile}.tmp`;
        await writeFile(temporaryFile, JSON.stringify(chatHistory, null, 2), 'utf8');
        await rename(temporaryFile, historyFile);
    });
    return saveQueue;
}

async function serializeChat(chatId, task) {
    const previous = chatQueues.get(chatId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    chatQueues.set(chatId, current);
    try {
        await current;
    } finally {
        if (chatQueues.get(chatId) === current) {
            chatQueues.delete(chatId);
        }
    }
}

async function updateProgressWithAnswer(ctx, progressMessage, text) {
    const chunks = formatTelegramMarkdown(text);
    await ctx.api.editMessageText({
        chat_id: ctx.chatId,
        message_id: progressMessage.message_id,
        text: chunks[0],
        parse_mode: 'HTML',
    });

    for (const chunk of chunks.slice(1)) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
    }
}

function startTypingIndicator(ctx) {
    const sendTyping = () => {
        ctx.api.sendChatAction({ chat_id: ctx.chatId, action: 'typing' })
            .catch((error) => console.error('Could not send typing indicator:', error));
    };

    sendTyping();
    return setInterval(sendTyping, 4000);
}

if (bot) {
    bot.command('start', async (ctx) => {
        await ctx.reply('Hi! 👋 I’m your AI assistant. Send me a message to get started. I’ll remember our conversation; use /reset to start fresh.');
    });

    bot.command('reset', async (ctx) => {
        const chatId = ctx.chatId;
        if (chatId === undefined) {
            return;
        }

        await serializeChat(String(chatId), async () => {
            delete chatHistory[chatId];
            await saveChatHistory();
            await ctx.reply('Conversation memory cleared.');
        });
    });

    bot.on('message', async (ctx) => {
        const message = ctx.message?.text;
        const chatId = ctx.chatId;
        if (!message || chatId === undefined || message.startsWith('/')) {
            return;
        }

        await serializeChat(String(chatId), async () => {
            let progressMessage;
            let typingInterval;

            try {
                progressMessage = await ctx.reply('Got it! I’m thinking through your message…');
                typingInterval = startTypingIndicator(ctx);

                const previousMessages = chatHistory[chatId] ?? [];
                const {
                    messages: requestMessages,
                    currentMessageTruncated,
                    historyTruncated,
                } = buildRequestMessages(
                    previousMessages,
                    message,
                    systemPrompt,
                    maxPromptContentBytes,
                );
                if (currentMessageTruncated || historyTruncated) {
                    await ctx.api.editMessageText({
                        chat_id: chatId,
                        message_id: progressMessage.message_id,
                        text: currentMessageTruncated
                            ? '💭 Your message is very long, so I’m shortening it to fit. I’m working on it…'
                            : '💭 I’m focusing on your latest messages to keep the request within limits…',
                    });
                }
                if (currentMessageTruncated) {
                    console.warn(`Truncated an oversized incoming message for chat ${chatId}.`);
                }
                const stream = await groq.chat.completions.create({
                    model: 'openai/gpt-oss-120b',
                    messages: requestMessages,
                    temperature: 1,
                    max_completion_tokens: 2048,
                    top_p: 1,
                    reasoning_effort: 'medium',
                    stream: true,
                    stop: null,
                });
                let answer = '';
                for await (const chunk of stream) {
                    answer += chunk.choices[0]?.delta?.content || '';
                }

                if (!answer) {
                    await ctx.api.editMessageText({
                        chat_id: chatId,
                        message_id: progressMessage.message_id,
                        text: 'I couldn’t come up with a response this time. Please try again.',
                    });
                    return;
                }

                chatHistory[chatId] = [
                    ...previousMessages,
                    { role: 'user', content: message },
                    { role: 'assistant', content: answer },
                ].slice(-maxHistoryMessages);
                await saveChatHistory();
                await updateProgressWithAnswer(ctx, progressMessage, answer);
            } catch (error) {
                console.error('Error processing chatbot message:', error);
                if (progressMessage) {
                    try {
                        await ctx.api.editMessageText({
                            chat_id: chatId,
                            message_id: progressMessage.message_id,
                            text: 'Sorry, I couldn’t finish that reply. Please try again in a moment.',
                        });
                    } catch (editError) {
                        console.error('Could not update the progress message:', editError);
                        await ctx.reply('Sorry, I couldn’t finish that reply. Please try again in a moment.');
                    }
                } else {
                    await ctx.reply('Sorry, I couldn’t start that reply. Please try again in a moment.');
                }
            } finally {
                if (typingInterval) {
                    clearInterval(typingInterval);
                }
            }
        });
    });

    bot.catch((error) => {
        console.error('Error handling Telegram update:', error);
    });
}

export { bot };

if (!process.env.VERCEL && bot) {
    console.log('Bot is running...');
    await run(bot);
}
