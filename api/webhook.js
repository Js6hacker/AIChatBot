import { bot } from '../index.js';

async function readRequestBody(req) {
    if (req.body !== undefined) {
        if (typeof req.body === 'string') {
            return JSON.parse(req.body);
        }
        if (Buffer.isBuffer(req.body)) {
            return JSON.parse(req.body.toString('utf8'));
        }
        return req.body;
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return body ? JSON.parse(body) : {};
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        res.status(200).json({
            status: 'ok',
            botConfigured: Boolean(process.env.BOT_TOKEN),
        });
        return;
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!bot) {
        res.status(500).json({ error: 'BOT_TOKEN is not configured' });
        return;
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
        const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
        if (receivedSecret !== secret) {
            res.status(401).json({ error: 'Invalid webhook secret' });
            return;
        }
    }

    try {
        const update = await readRequestBody(req);
        await bot.handleUpdate(update);
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Could not process update' });
    }
}
