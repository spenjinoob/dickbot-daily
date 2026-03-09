import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import crypto from 'crypto';

const SETTLER_MNEMONIC = process.env.SETTLER_MNEMONIC;
if (!SETTLER_MNEMONIC) {
    console.error('ERROR: Set SETTLER_MNEMONIC environment variable');
    process.exit(1);
}

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const mnemonic = new Mnemonic(SETTLER_MNEMONIC, '', network);
const wallet = mnemonic.deriveOPWallet();

const CONTRACT = 'opt1sqr2hdez73pyz3xepn4cgu2muj9zhqcnqwy6qf26m';
const POLL_INTERVAL = 30000;
const REVEAL_WINDOW = 10n;

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

async function getState() {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network);
    const s = await contract.getState();
    return s.properties;
}

async function getUTXOs() {
    return provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
}

async function commitAndReveal(purchaseCount) {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);

    // Phase 1: Generate secret and commit
    console.log('  Phase 1: Generating secret and committing...');
    const secretBytes = crypto.randomBytes(32);
    const secret = BigInt('0x' + secretBytes.toString('hex'));
    const hashBytes = crypto.createHash('sha256').update(secretBytes).digest();
    const commitHash = BigInt('0x' + hashBytes.toString('hex'));

    // opnet library throws on simulation errors — no need for 'error' in check
    const commitSim = await contract.commitSettle(commitHash);

    const utxos = await getUTXOs();
    const commitTx = await commitSim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        utxos,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 50,
        network,
    });
    console.log(`  Commit TX: ${commitTx?.transactionId ?? 'unknown'}`);

    // Phase 2: Wait for commit confirm + next block (up to 25 min for testnet)
    console.log('  Phase 2: Waiting for next block...');
    let blockAdvanced = false;
    for (let i = 0; i < 150; i++) {
        await sleep(10000);
        try {
            const state = await getState();
            if (state.commitBlock > 0n && state.currentBlock > state.commitBlock) {
                console.log(`  Next block reached (commit: ${state.commitBlock}, current: ${state.currentBlock})`);
                blockAdvanced = true;
                break;
            }
            if (state.commitBlock > 0n) {
                console.log(`  Commit at block ${state.commitBlock}, waiting for next... (${i * 10}s)`);
            }
        } catch {
            // State fetch failed, keep polling
        }
    }
    if (!blockAdvanced) throw new Error('Timed out waiting for next block after commit');

    // Phase 3: Find winning index and reveal
    console.log(`  Phase 3: Searching ${purchaseCount} entries for winner...`);
    const contract2 = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
    for (let i = 0; i < purchaseCount; i++) {
        try {
            // opnet throws for wrong indices — catch and try next
            const sim = await contract2.revealSettle(secret, BigInt(i));
            console.log(`  Found winning entry at index ${i}!`);
            console.log('  Sending reveal TX...');
            const utxos2 = await getUTXOs();
            const tx = await sim.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                utxos: utxos2,
                maximumAllowedSatToSpend: 100_000n,
                feeRate: 50,
                network,
            });
            return tx?.transactionId ?? null;
        } catch (_e) {
            // This index doesn't contain the winner, try next
        }
    }
    return null;
}

console.log('=== KingDick Auto-Settler (Commit-Reveal) ===');
console.log('Settler wallet:', wallet.p2tr);
console.log('Contract:', CONTRACT);
console.log('Polling every', POLL_INTERVAL / 1000, 'seconds\n');

while (true) {
    try {
        const state = await getState();
        const blocksLeft = Number(state.snapshotBlock) - Number(state.currentBlock);
        const pot = (Number(state.totalPot) / 1e18).toFixed(2);
        const purchaseCount = Number(state.purchaseCount);
        const hasCommit = state.commitBlock > 0n;

        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] Block ${state.currentBlock} | Tickets: ${state.totalTickets} | Pot: ${pot} MOTO | Settled: ${state.settled} | Commit: ${hasCommit ? 'block ' + state.commitBlock : 'none'}`);

        if (state.settled) {
            console.log('  Cycle already settled. Waiting for next cycle...');
        } else if (blocksLeft > 0) {
            console.log(`  ${blocksLeft} blocks until settlement available`);
        } else if (Number(state.totalTickets) === 0) {
            console.log('  No tickets to settle');
        } else if (hasCommit && (state.currentBlock - state.commitBlock) <= REVEAL_WINDOW) {
            console.log('  Commit exists — someone else is settling or it will expire');
        } else {
            if (hasCommit) {
                console.log('  Expired commit detected — commitSettle will clear it');
            }
            console.log('  >>> SETTLEMENT AVAILABLE! Starting commit-reveal...');
            const txId = await commitAndReveal(purchaseCount);
            if (txId) {
                console.log(`  SETTLED! TX: ${txId}`);
                console.log('  Waiting for confirmation...');
                await sleep(60000);
                const newState = await getState();
                console.log(`  Winner confirmed! Last winner: ${newState.lastWinner}`);
                console.log(`  Last pot: ${(Number(newState.lastPot) / 1e18).toFixed(2)} MOTO`);
            } else {
                console.log('  Could not find winning purchase index. Will retry...');
            }
        }
    } catch (e) {
        console.log(`[ERROR] ${e.message}`);
    }

    await sleep(POLL_INTERVAL);
}
