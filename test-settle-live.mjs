/**
 * Live settlement test — waits for cycle to close then runs full commit-reveal.
 * This broadcasts actual transactions to testnet.
 *
 * Usage: node test-settle-live.mjs
 */

import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import crypto from 'crypto';
import fs from 'fs';

const WALLET_FILE = '/home/vibecode/motocatroulette1.1/.test-wallets.json';
const phrase = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'))[0].phrase;

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const mnemonic = new Mnemonic(phrase, '', network);
const wallet = mnemonic.deriveOPWallet();

const CONTRACT = 'opt1sqzr6vxl8cp9u89uzj7zcyxr76zdc78urxsl6kx2d';

const KingDickAbi = [
    { name: 'commitSettle', inputs: [{ name: 'commitHash', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'commitBlock', type: ABIDataTypes.UINT256 }], type: BitcoinAbiTypes.Function },
    { name: 'revealSettle', inputs: [{ name: 'secret', type: ABIDataTypes.UINT256 }, { name: 'purchaseIndex', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'winner', type: ABIDataTypes.ADDRESS }], type: BitcoinAbiTypes.Function },
    { name: 'getState', inputs: [], outputs: [
        { name: 'cycleId', type: ABIDataTypes.UINT256 }, { name: 'totalTickets', type: ABIDataTypes.UINT256 },
        { name: 'totalPot', type: ABIDataTypes.UINT256 }, { name: 'snapshotBlock', type: ABIDataTypes.UINT256 },
        { name: 'currentBlock', type: ABIDataTypes.UINT256 }, { name: 'kingAddress', type: ABIDataTypes.ADDRESS },
        { name: 'kingStreak', type: ABIDataTypes.UINT256 }, { name: 'lastWinner', type: ABIDataTypes.ADDRESS },
        { name: 'lastPot', type: ABIDataTypes.UINT256 }, { name: 'settled', type: ABIDataTypes.BOOL },
        { name: 'purchaseCount', type: ABIDataTypes.UINT256 }, { name: 'commitBlock', type: ABIDataTypes.UINT256 },
    ], type: BitcoinAbiTypes.Function },
    ...OP_NET_ABI,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ts() { return new Date().toLocaleTimeString(); }

async function getState() {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network);
    return (await contract.getState()).properties;
}

console.log('=== KingDick LIVE Settlement Test ===');
console.log('Wallet:', wallet.p2tr);
console.log('Contract:', CONTRACT);
console.log('');

// Step 1: Wait for cycle to be ready
console.log('--- Step 1: Waiting for cycle to close ---');
let state;
while (true) {
    state = await getState();
    const left = Number(state.snapshotBlock) - Number(state.currentBlock);

    if (state.settled) {
        console.log(`[${ts()}] Cycle already settled! Done.`);
        process.exit(0);
    }

    if (left <= 0 && state.totalTickets > 0n) {
        console.log(`[${ts()}] Cycle closed! ${state.purchaseCount} entries, ${(Number(state.totalPot) / 1e18).toFixed(2)} MOTO pot`);
        break;
    }

    console.log(`[${ts()}] Block ${state.currentBlock} — ${left > 0 ? left + ' blocks left' : 'no tickets yet'}`);
    await sleep(15000);
}

// Step 2: Check/handle existing commit
if (state.commitBlock > 0n) {
    const age = Number(state.currentBlock) - Number(state.commitBlock);
    if (age <= 10) {
        console.log(`[${ts()}] Active commit exists (age ${age}), waiting for expiry...`);
        while (true) {
            await sleep(15000);
            state = await getState();
            if (state.commitBlock === 0n) break;
            const newAge = Number(state.currentBlock) - Number(state.commitBlock);
            if (newAge > 10) break;
            console.log(`[${ts()}] Commit age: ${newAge}/10 blocks`);
        }
    }
    console.log(`[${ts()}] No active commit — proceeding`);
}

// Step 3: Commit
console.log('');
console.log('--- Step 2: Generating secret & committing ---');
const secretBytes = crypto.randomBytes(32);
const secret = BigInt('0x' + secretBytes.toString('hex'));
const hashBytes = crypto.createHash('sha256').update(secretBytes).digest();
const commitHash = BigInt('0x' + hashBytes.toString('hex'));

console.log('  secret:', secret.toString(16).padStart(64, '0'));
console.log('  commitHash:', commitHash.toString(16).padStart(64, '0'));

const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);

let commitSim;
try {
    commitSim = await contract.commitSettle(commitHash);
} catch (e) {
    console.error('FAIL: commitSettle simulation error:', e.message);
    process.exit(1);
}

const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
console.log('  UTXOs:', utxos.length);

const commitTx = await commitSim.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    utxos,
    maximumAllowedSatToSpend: 100_000n,
    feeRate: 50,
    network,
});
console.log('  Commit TX broadcast:', commitTx?.transactionId ?? 'unknown');

// Step 4: Wait for commit confirmation + next block
console.log('');
console.log('--- Step 3: Waiting for commit confirmation + next block ---');
let confirmed = false;
for (let i = 0; i < 120; i++) {
    await sleep(10000);
    try {
        state = await getState();
    } catch {
        console.log(`[${ts()}] State fetch failed, retrying...`);
        continue;
    }

    if (state.settled) {
        console.log(`[${ts()}] Cycle was settled by someone else!`);
        process.exit(0);
    }

    if (state.commitBlock > 0n) {
        if (state.currentBlock > state.commitBlock) {
            console.log(`[${ts()}] Commit confirmed at block ${state.commitBlock}, current block ${state.currentBlock} — ready to reveal!`);
            confirmed = true;
            break;
        }
        console.log(`[${ts()}] Commit at block ${state.commitBlock}, waiting for next block...`);
    } else {
        console.log(`[${ts()}] Waiting for commit tx to be mined... (${i * 10}s)`);
    }
}

if (!confirmed) {
    console.error('FAIL: Commit never confirmed after 20 minutes');
    process.exit(1);
}

// Step 5: Find winner and reveal
console.log('');
console.log(`--- Step 4: Finding winner among ${state.purchaseCount} entries ---`);
const contract2 = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
const purchaseCount = Number(state.purchaseCount);

let winnerSim = null;
let winnerIndex = -1;
for (let i = 0; i < purchaseCount; i++) {
    try {
        const sim = await contract2.revealSettle(secret, BigInt(i));
        winnerSim = sim;
        winnerIndex = i;
        console.log(`  Index ${i}: WINNER FOUND!`);
        break;
    } catch (e) {
        const msg = e.message?.slice(0, 100) || String(e).slice(0, 100);
        console.log(`  Index ${i}: ${msg}`);
    }
}

if (!winnerSim) {
    console.error('');
    console.error('FAIL: No winning index found!');
    console.error('This means the secret does not match the on-chain commit.');
    console.error('Possible causes:');
    console.error('  - The commit tx that was mined is different from ours');
    console.error('  - Another user committed between our check and our tx');
    console.error('  - Bug in secret → hash conversion');
    process.exit(1);
}

// Reveal
console.log('  Broadcasting reveal...');
const utxos2 = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
const revealTx = await winnerSim.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    utxos: utxos2,
    maximumAllowedSatToSpend: 100_000n,
    feeRate: 50,
    network,
});
console.log('  Reveal TX broadcast:', revealTx?.transactionId ?? 'unknown');

// Step 6: Verify
console.log('');
console.log('--- Step 5: Verifying settlement ---');
console.log('  Waiting 30s for confirmation...');
await sleep(30000);

try {
    const finalState = await getState();
    console.log('  settled:', finalState.settled);
    console.log('  lastWinner:', finalState.lastWinner);
    console.log('  lastPot:', (Number(finalState.lastPot) / 1e18).toFixed(2), 'MOTO');
    console.log('  new cycleId:', finalState.cycleId.toString());

    if (finalState.settled || finalState.cycleId > state.cycleId) {
        console.log('');
        console.log('=== SETTLEMENT SUCCESSFUL! ===');
    } else {
        console.log('');
        console.log('Settlement may still be confirming. Check state again in a minute.');
    }
} catch (e) {
    console.log('  Could not read final state:', e.message);
}

process.exit(0);
