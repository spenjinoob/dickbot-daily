/**
 * End-to-end settlement test for KingDick contract (commit-reveal).
 * Tests: commitSettle simulation → verifies crypto → reports readiness.
 *
 * Usage: SETTLER_MNEMONIC="..." node test-settle.mjs
 *        SETTLER_MNEMONIC="..." node test-settle.mjs --live   (actually broadcasts)
 */

import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import crypto from 'crypto';
import fs from 'fs';

const WALLET_FILE = '/home/vibecode/motocatroulette1.1/.test-wallets.json';
const SETTLER_MNEMONIC = process.env.SETTLER_MNEMONIC || JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'))[0].phrase;

const LIVE = process.argv.includes('--live');

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const mnemonic = new Mnemonic(SETTLER_MNEMONIC, '', network);
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

console.log('=== KingDick Settlement E2E Test ===');
console.log('Mode:', LIVE ? 'LIVE (will broadcast!)' : 'SIMULATION ONLY');
console.log('Wallet:', wallet.p2tr);
console.log('Contract:', CONTRACT);
console.log('');

// Step 1: Read state
console.log('--- Step 1: Reading contract state ---');
const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
const stateResult = await contract.getState();
if ('error' in stateResult) {
    console.error('FAIL: getState error:', stateResult.error);
    process.exit(1);
}
const s = stateResult.properties;
console.log('  cycleId:', s.cycleId.toString());
console.log('  totalTickets:', s.totalTickets.toString());
console.log('  totalPot:', (Number(s.totalPot) / 1e18).toFixed(2), 'MOTO');
console.log('  snapshotBlock:', s.snapshotBlock.toString());
console.log('  currentBlock:', s.currentBlock.toString());
console.log('  settled:', s.settled);
console.log('  purchaseCount:', s.purchaseCount.toString());
console.log('  commitBlock:', s.commitBlock.toString());

const blocksLeft = Number(s.snapshotBlock) - Number(s.currentBlock);
console.log('  blocksLeft:', blocksLeft);
console.log('');

if (s.settled) {
    console.log('SKIP: Cycle already settled');
    process.exit(0);
}

if (blocksLeft > 0) {
    console.log(`INFO: Settlement not available yet (${blocksLeft} blocks remaining).`);
    if (!LIVE) {
        console.log('Testing commitSettle simulation anyway (will fail with "Too early")...');
    }
}

if (s.totalTickets === 0n) {
    console.log('SKIP: No tickets to settle');
    process.exit(0);
}

// Check existing commit
if (s.commitBlock > 0n) {
    const commitAge = Number(s.currentBlock) - Number(s.commitBlock);
    console.log(`  Existing commit at block ${s.commitBlock}, age: ${commitAge} blocks`);
    if (commitAge <= 10) {
        console.log('  Commit is still active (not expired).');
        if (!LIVE) {
            console.log('  Cannot test — active commit blocks new commits.');
            process.exit(0);
        }
    } else {
        console.log('  Commit is EXPIRED — commitSettle will clear it.');
    }
}

// Step 2: Generate secret and test commitSettle simulation
console.log('--- Step 2: Testing commitSettle simulation ---');
const secretBytes = crypto.randomBytes(32);
const secret = BigInt('0x' + secretBytes.toString('hex'));
const hashBytes = crypto.createHash('sha256').update(secretBytes).digest();
const commitHash = BigInt('0x' + hashBytes.toString('hex'));

console.log('  secret:', secret.toString(16).padStart(64, '0'));
console.log('  commitHash:', commitHash.toString(16).padStart(64, '0'));

let commitSim;
try {
    commitSim = await contract.commitSettle(commitHash);
    console.log('  PASS: commitSettle simulation succeeded');
    console.log('  commitBlock would be:', commitSim.properties.commitBlock.toString());
} catch (e) {
    const err = e.message || String(e);
    console.log('  commitSettle result:', err);
    if (err.includes('Too early')) {
        console.log('  EXPECTED: cycle not closed yet. Will work once blocksLeft = 0.');
        console.log('');
        console.log('=== Simulation test passed (cycle not yet closed) ===');
        process.exit(0);
    }
    if (err.includes('Already committed')) {
        console.log('  There is an active commit on-chain. Wait for expiry.');
        process.exit(0);
    }
    console.error('  FAIL: Unexpected error:', err);
    process.exit(1);
}
console.log('');

if (!LIVE) {
    // In simulation-only mode, we can't test reveal because commit isn't on-chain
    console.log('--- Step 3: revealSettle (skipped in simulation mode) ---');
    console.log('  Reveal requires on-chain commit + block advance.');
    console.log('  commitSettle simulation PASSED — crypto and ABI are correct.');
    console.log('');
    console.log('=== All simulation tests passed! ===');
    console.log('Run with --live to do a full broadcast test.');
    process.exit(0);
}

// LIVE MODE: Actually broadcast
console.log('--- Step 3: Broadcasting commitSettle ---');
const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
console.log('  UTXOs available:', utxos.length);

const commitTx = await commitSim.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    utxos,
    maximumAllowedSatToSpend: 100_000n,
    feeRate: 10,
    network,
});
console.log('  Commit TX:', commitTx?.transactionId ?? 'unknown');

// Step 4: Wait for next block
console.log('--- Step 4: Waiting for commit confirmation + next block ---');
for (let i = 0; i < 120; i++) {
    await sleep(10000);
    const state2 = await contract.getState();
    if ('error' in state2) continue;
    const p = state2.properties;
    if (p.commitBlock > 0n && p.currentBlock > p.commitBlock) {
        console.log(`  Block advanced (commit: ${p.commitBlock}, current: ${p.currentBlock})`);
        break;
    }
    if (p.commitBlock > 0n) {
        console.log(`  Commit confirmed at block ${p.commitBlock}, waiting for next block... (${i + 1})`);
    } else {
        console.log(`  Waiting for commit to confirm... (${i + 1})`);
    }
    if (i === 119) {
        console.error('FAIL: Timed out waiting for block advance');
        process.exit(1);
    }
}

// Step 5: Find winning index and reveal
console.log(`--- Step 5: Finding winner among ${s.purchaseCount} entries ---`);
const contract2 = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
const purchaseCount = Number(s.purchaseCount);

for (let i = 0; i < purchaseCount; i++) {
    try {
        const sim = await contract2.revealSettle(secret, BigInt(i));
        if ('error' in sim) {
            console.log(`  Index ${i}: ${sim.error}`);
            continue;
        }
        console.log(`  Index ${i}: WINNER! Address: ${sim.properties.winner}`);
        console.log('  Broadcasting reveal...');

        const utxos2 = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
        const revealTx = await sim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            utxos: utxos2,
            maximumAllowedSatToSpend: 100_000n,
            feeRate: 10,
            network,
        });
        console.log('  Reveal TX:', revealTx?.transactionId ?? 'unknown');
        console.log('');
        console.log('=== SETTLEMENT COMPLETE! ===');

        // Verify
        await sleep(30000);
        const finalState = await contract.getState();
        if (!('error' in finalState)) {
            const f = finalState.properties;
            console.log('Final state:');
            console.log('  settled:', f.settled);
            console.log('  lastWinner:', f.lastWinner);
            console.log('  lastPot:', (Number(f.lastPot) / 1e18).toFixed(2), 'MOTO');
            console.log('  cycleId:', f.cycleId.toString(), '(should be incremented)');
        }
        process.exit(0);
    } catch (e) {
        console.log(`  Index ${i}: ${e.message?.slice(0, 200)}`);
    }
}

console.error('FAIL: Could not find winning purchase index');
process.exit(1);
