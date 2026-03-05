import https from 'https';
import dns from 'dns';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

// --- Config ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('ERROR: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables');
    process.exit(1);
}

// Resolve Telegram API IP at startup (workaround for WSL DNS issues with Node)
let TELEGRAM_IP = null;
try {
    const addrs = await dns.promises.resolve4('api.telegram.org');
    TELEGRAM_IP = addrs[0];
    console.log(`Resolved api.telegram.org → ${TELEGRAM_IP}`);
} catch {
    console.error('WARNING: Could not resolve api.telegram.org, will try direct hostname');
}

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

const CONTRACT = 'opt1sqzr6vxl8cp9u89uzj7zcyxr76zdc78urxsl6kx2d';
const SNAPSHOT_OFFSET = 135;
const POLL_INTERVAL = 30_000;
const COUNTDOWN_INTERVAL = 10; // post countdown every ~10 blocks

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
const formatMoto = (raw) => (Number(raw) / 1e18).toFixed(2);
const shortAddr = (addr) => {
    const s = String(addr);
    if (s.length <= 16) return s;
    return s.slice(0, 10) + '...' + s.slice(-6);
};

function sendTelegram(text) {
    return new Promise((resolve) => {
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
            headers: {
                'Host': 'api.telegram.org',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            rejectUnauthorized: !TELEGRAM_IP, // skip cert check only when using IP
        }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.ok) console.error('Telegram API error:', data.description);
                } catch { /* ignore parse errors */ }
                resolve();
            });
        });
        req.on('error', (e) => { console.error('Failed to send Telegram message:', e.message); resolve(); });
        req.write(payload);
        req.end();
    });
}

async function getState() {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network);
    const s = await contract.getState();
    return s.properties;
}

// --- State tracking ---
let prev = null;
let lastCountdownBlock = 0n;
let startupDone = false;

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

    // First poll — just record state, don't spam on startup
    if (!prev) {
        prev = { cycleId, totalTickets, totalPot, commitBlock, settled, currentBlock };
        lastCountdownBlock = currentBlock;
        startupDone = true;
        console.log(`Initial state: Cycle ${cycleId} | ${totalTickets} tickets | ${pot} MOTO | Block ${currentBlock}`);
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
        console.log(`>> Sent: Winner cycle #${Number(cycleId) - 1}, prize ${prize} MOTO`);
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
        console.log(`>> Sent: ${newTickets} new tickets, pot ${pot}`);
    }

    // --- Event: Settlement committed ---
    if (commitBlock > 0n && prev.commitBlock === 0n) {
        await sendTelegram(
            `\u{26A1} <b>Settlement started!</b>\n` +
            `Commit at block ${commitBlock} — reveal incoming...\n` +
            `\u{1F4B0} Pot: <b>${pot} MOTO</b>`
        );
        console.log(`>> Sent: Settlement committed at block ${commitBlock}`);
    }

    // --- Event: Settlement available (blocksLeft <= 0, not settled, no commit) ---
    if (blocksLeft <= 0 && !settled && commitBlock === 0n && Number(totalTickets) > 0) {
        const prevBlocksLeft = Number(prev.currentBlock ? (snapshotBlock - prev.currentBlock) : 1n);
        if (prevBlocksLeft > 0) {
            await sendTelegram(
                `\u{23F0} <b>SETTLEMENT AVAILABLE!</b>\n` +
                `\u{1F4B0} Pot: <b>${pot} MOTO</b>\n` +
                `\u{1F3AB} ${totalTickets} tickets in the running\n` +
                `Who will claim the 0.2% settler fee?`
            );
            console.log(`>> Sent: Settlement available, pot ${pot}`);
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
            console.log(`>> Sent: Countdown ${blocksLeft} blocks`);
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
console.log(`Polling every ${POLL_INTERVAL / 1000}s\n`);

// Send startup message
await sendTelegram('\u{1F916} <b>DickBot Daily Online!</b>\nMonitoring the game...');

while (true) {
    try {
        await poll();
    } catch (e) {
        console.error(`[${new Date().toLocaleTimeString()}] Poll error: ${e.message}`);
    }
    await sleep(POLL_INTERVAL);
}
