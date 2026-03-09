import https from 'https';
import dns from 'dns';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

// --- Global crash protection ---
process.on('uncaughtException', (err) => {
    console.error(`[${ts()}] UNCAUGHT EXCEPTION: ${err.message}`);
    console.error(err.stack);
    // Don't exit — keep running
});
process.on('unhandledRejection', (reason) => {
    console.error(`[${ts()}] UNHANDLED REJECTION: ${reason}`);
    // Don't exit — keep running
});

// --- Config ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('ERROR: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables');
    process.exit(1);
}

const network = networks.opnetTestnet;
const CONTRACT = 'opt1sqqnssdpgnmf7mmxmleeekatkclu0mw3cxg0zmjtg';
const SNAPSHOT_OFFSET = 135;
const POLL_INTERVAL = 30_000;
const COUNTDOWN_INTERVAL = 10;
const DNS_REFRESH_INTERVAL = 300_000; // re-resolve Telegram IP every 5 min
const MAX_CONSECUTIVE_ERRORS = 10;

const KingDickAbi = [
    {
        name: 'getState',
        inputs: [],
        outputs: [
            { name: 'cycleId', type: ABIDataTypes.UINT256 },
            { name: 'totalTickets', type: ABIDataTypes.UINT256 },
            { name: 'totalPot', type: ABIDataTypes.UINT256 },
            { name: 'snapshotBlock', type: ABIDataTypes.UINT256 },
            { name: 'currentBlock', type: ABIDataTypes.UINT256 },
            { name: 'kingAddress', type: ABIDataTypes.ADDRESS },
            { name: 'kingStreak', type: ABIDataTypes.UINT256 },
            { name: 'lastWinner', type: ABIDataTypes.ADDRESS },
            { name: 'lastPot', type: ABIDataTypes.UINT256 },
            { name: 'settled', type: ABIDataTypes.BOOL },
            { name: 'purchaseCount', type: ABIDataTypes.UINT256 },
            { name: 'commitBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...OP_NET_ABI,
];

// --- Helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString();
const formatMoto = (raw) => (Number(raw) / 1e18).toFixed(2);
const shortAddr = (addr) => {
    const s = String(addr);
    if (s.length <= 16) return s;
    return s.slice(0, 10) + '...' + s.slice(-6);
};

// --- DNS resolution with periodic refresh ---
let TELEGRAM_IP = null;
let lastDnsRefresh = 0;

async function refreshDns() {
    try {
        const addrs = await dns.promises.resolve4('api.telegram.org');
        TELEGRAM_IP = addrs[0];
        lastDnsRefresh = Date.now();
        console.log(`[${ts()}] DNS: api.telegram.org → ${TELEGRAM_IP}`);
    } catch {
        console.error(`[${ts()}] DNS: Could not resolve api.telegram.org`);
        // Keep using previous IP or hostname fallback
    }
}

// Initial DNS resolve
await refreshDns();

// --- Provider with reconnection ---
let provider = null;
let consecutiveErrors = 0;

function getProvider() {
    if (!provider || consecutiveErrors >= 3) {
        if (consecutiveErrors >= 3) {
            console.log(`[${ts()}] Reconnecting provider after ${consecutiveErrors} errors...`);
        }
        provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
        consecutiveErrors = 0;
    }
    return provider;
}

// --- Telegram sender with timeout ---
function sendTelegram(text) {
    return new Promise((resolve) => {
        // Refresh DNS if stale
        if (Date.now() - lastDnsRefresh > DNS_REFRESH_INTERVAL) {
            refreshDns().catch(() => {});
        }

        const payload = JSON.stringify({
            chat_id: CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        });
        const host = TELEGRAM_IP || 'api.telegram.org';
        const req = https.request({
            hostname: host,
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            timeout: 15_000,
            headers: {
                'Host': 'api.telegram.org',
                'Content-Type': 'application/json',
                'Content-Length': new TextEncoder().encode(payload).byteLength,
            },
            rejectUnauthorized: !TELEGRAM_IP,
        }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.ok) console.error(`[${ts()}] Telegram API error:`, data.description);
                } catch { /* ignore parse errors */ }
                resolve();
            });
        });
        req.on('timeout', () => {
            console.error(`[${ts()}] Telegram request timed out`);
            req.destroy();
            resolve();
        });
        req.on('error', (e) => {
            console.error(`[${ts()}] Telegram send failed: ${e.message}`);
            resolve();
        });
        req.write(payload);
        req.end();
    });
}

async function getState() {
    const p = getProvider();
    const contract = getContract(CONTRACT, KingDickAbi, p, network);
    const s = await contract.getState();
    return s.properties;
}

// --- State tracking ---
let prev = null;
let lastCountdownBlock = 0n;

async function poll() {
    const state = await getState();

    const cycleId = state.cycleId;
    const totalTickets = state.totalTickets;
    const totalPot = state.totalPot;
    const snapshotBlock = state.snapshotBlock;
    const currentBlock = state.currentBlock;
    const kingStreak = state.kingStreak;
    const lastWinner = state.lastWinner;
    const lastPot = state.lastPot;
    const settled = state.settled;
    const commitBlock = state.commitBlock;

    const blocksLeft = Number(snapshotBlock) - Number(currentBlock);
    const pot = formatMoto(totalPot);

    // Reset error counter on successful poll
    consecutiveErrors = 0;

    // First poll — just record state, don't spam on startup
    if (!prev) {
        prev = { cycleId, totalTickets, totalPot, commitBlock, settled, currentBlock };
        lastCountdownBlock = currentBlock;
        console.log(`[${ts()}] Initial: Cycle ${cycleId} | ${totalTickets} tickets | ${pot} MOTO | Block ${currentBlock}`);
        return;
    }

    // --- Event: Cycle settled (cycleId incremented) ---
    if (cycleId > prev.cycleId) {
        const prize = formatMoto(lastPot);
        const winner = shortAddr(lastWinner);
        const streak = Number(kingStreak);
        await sendTelegram(
            `\u{1F3C6} <b>WINNER!</b> Cycle #${Number(cycleId) - 1} settled!\n` +
            `\u{1F4B0} Prize: <b>${prize} MOTO</b>\n` +
            `\u{1F451} King streak: ${streak}\n` +
            `\u{1F464} Winner: <code>${winner}</code>\n\n` +
            `New cycle #${cycleId} has begun!`
        );
        console.log(`[${ts()}] >> Winner cycle #${Number(cycleId) - 1}, prize ${prize} MOTO`);
    }

    // --- Event: New tickets purchased ---
    if (totalTickets > prev.totalTickets && cycleId === prev.cycleId) {
        const newTickets = Number(totalTickets) - Number(prev.totalTickets);
        const msg = blocksLeft > 0
            ? `\u{1F3AB} <b>${newTickets} new ticket${newTickets > 1 ? 's' : ''} bought!</b>\n` +
              `\u{1F4B0} Pot: <b>${pot} MOTO</b> | \u{1F3AB} Total: ${totalTickets}\n` +
              `\u23F3 ${blocksLeft} blocks until settlement`
            : `\u{1F3AB} <b>${newTickets} new ticket${newTickets > 1 ? 's' : ''} bought!</b>\n` +
              `\u{1F4B0} Pot: <b>${pot} MOTO</b> | \u{1F3AB} Total: ${totalTickets}\n` +
              `\u{23F0} Settlement available NOW!`;
        await sendTelegram(msg);
        console.log(`[${ts()}] >> ${newTickets} new tickets, pot ${pot}`);
    }

    // --- Event: Settlement committed ---
    if (commitBlock > 0n && prev.commitBlock === 0n) {
        await sendTelegram(
            `\u{26A1} <b>Settlement started!</b>\n` +
            `Commit at block ${commitBlock} — reveal incoming...\n` +
            `\u{1F4B0} Pot: <b>${pot} MOTO</b>`
        );
        console.log(`[${ts()}] >> Settlement committed at block ${commitBlock}`);
    }

    // --- Event: Settlement available ---
    if (blocksLeft <= 0 && !settled && commitBlock === 0n && Number(totalTickets) > 0) {
        const prevBlocksLeft = Number(prev.currentBlock ? (snapshotBlock - prev.currentBlock) : 1n);
        if (prevBlocksLeft > 0) {
            await sendTelegram(
                `\u{23F0} <b>SETTLEMENT AVAILABLE!</b>\n` +
                `\u{1F4B0} Pot: <b>${pot} MOTO</b>\n` +
                `\u{1F3AB} ${totalTickets} tickets in the running\n` +
                `Who will claim the 0.2% settler fee?`
            );
            console.log(`[${ts()}] >> Settlement available, pot ${pot}`);
        }
    }

    // --- Countdown: every COUNTDOWN_INTERVAL blocks ---
    if (blocksLeft > 0 && !settled && Number(totalTickets) > 0) {
        const blocksSinceLast = Number(currentBlock - lastCountdownBlock);
        if (blocksSinceLast >= COUNTDOWN_INTERVAL) {
            await sendTelegram(
                `\u{23F3} <b>${blocksLeft} blocks until settlement</b>\n` +
                `\u{1F4B0} Pot: ${pot} MOTO | \u{1F3AB} ${totalTickets} tickets`
            );
            console.log(`[${ts()}] >> Countdown ${blocksLeft} blocks`);
            lastCountdownBlock = currentBlock;
        }
    }

    // Update previous state
    prev = { cycleId, totalTickets, totalPot, commitBlock, settled, currentBlock };
}

// --- Main loop ---
console.log('=== KingDick Telegram Bot ===');
console.log(`Contract: ${CONTRACT}`);
console.log(`Chat: ${CHAT_ID}`);
console.log(`Polling every ${POLL_INTERVAL / 1000}s`);
console.log(`PID: ${process.pid}\n`);

// Send startup message
await sendTelegram('\u{1F916} <b>DickBot Daily Online!</b>\nMonitoring the game...');

while (true) {
    try {
        await poll();
    } catch (e) {
        consecutiveErrors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[${ts()}] Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error(`[${ts()}] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — recreating provider`);
            provider = null;
            consecutiveErrors = 0;
            // Also refresh DNS in case it's a network issue
            await refreshDns();
        }

        // Back off on errors: wait longer between retries
        const backoff = Math.min(consecutiveErrors * 10_000, 60_000);
        await sleep(backoff);
    }

    await sleep(POLL_INTERVAL);
}
