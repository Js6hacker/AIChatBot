# Telegram AI Chatbot

A Telegram chatbot built with Node.js, the Telegram Bot API, and Groq. It keeps a short conversation history for each chat, formats Markdown responses for Telegram, and displays a typing indicator while generating replies.

## Features

- Uses Groq's `openai/gpt-oss-120b` model.
- Remembers up to 10 recent exchanges per chat and saves them locally between restarts.
- Provides `/reset` to clear the current chat's saved conversation.
- Shows a progress message and Telegram's typing indicator while responding.
- Formats headings, bold text, inline code, fenced code blocks, and Markdown tables. Tables are rendered as readable lists because Telegram messages do not support table layouts.
- Bounds prompt content to help avoid oversized model requests.

## Requirements

- Node.js 18.2 or newer.
- A Telegram bot token from [@BotFather](https://t.me/BotFather).
- A Groq API key from the [Groq Console](https://console.groq.com/keys).

## Setup

1. Clone the repository and install dependencies:

   ```sh
   git clone <your-repository-url>
   cd <your-repository-folder>
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   BOT_TOKEN=your_telegram_bot_token
   GROQ_API_KEY=your_groq_api_key
   ```

   Keep these values private. Do not commit `.env` or share your API keys.

3. Start the bot:

   ```sh
   node index.js
   ```

   Keep the process running while you use the bot. In Telegram, open your bot and send `/start`.

## Bot commands

- `/start` — Show the welcome message.
- `/reset` — Clear the conversation memory for the current chat.

Send any other text message to chat with the assistant.

## Conversation memory and privacy

Conversation history is stored in `chat-history.json` in the project directory. Each Telegram chat has a separate history. In a group chat, the history is shared by the group; use the bot in a private chat for a separate conversation.

The history file is excluded from Git by `.gitignore`, but it is still stored as plain text on the machine running the bot. Protect that machine and back up the file only if you intend to retain the conversations. `/reset` deletes the history for the current chat.

The bot currently uses a local JSON file and is intended to run as a single process. Multiple instances sharing the same history file are not supported.

## GitHub publishing checklist

Before pushing the project:

- Confirm `.env` is not tracked and contains no real credentials in any commit.
- Keep `chat-history.json` out of the repository; it may contain private messages and chat IDs.
- If a credential was accidentally pushed, revoke or rotate it with Telegram or Groq. Removing it in a later commit does not erase it from Git history.

## Project files

- `index.js` — Telegram bot, Groq requests, and local history persistence.
- `conversation-context.js` — Builds bounded model prompts from recent conversation history.
- `telegram-format.js` — Converts supported Markdown formatting into Telegram-compatible HTML.
