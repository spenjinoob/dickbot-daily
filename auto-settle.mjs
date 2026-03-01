import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import fs from 'fs';

const wallets = JSON.parse(fs.readFileSync('../motocatroulette1.1/.test-wallets.json', 'utf-8'));
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const mnemonic = new Mnemonic(wallets[0].phrase, '', network);
const wallet = mnemonic.deriveOPWallet();

const CONTRACT = 'opt1sqz52ykz8mzmxn8x0a4naf44uztdys2y4m5dzdeh2';
const POLL_INTERVAL = 30000; // 30 seconds

const KingDickAbi = [
    { name: 'settle', inputs: [{ name: 'purchaseIndex', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'winner', type: ABIDataTypes.ADDRESS }], type: BitcoinAbiTypes.Function },
    { name: 'getState', inputs: [], outputs: [
        { name: 'cycleId', type: ABIDataTypes.UINT256 }, { name: 'totalTickets', type: ABIDataTypes.UINT256 },
        { name: 'totalPot', type: ABIDataTypes.UINT256 }, { name: 'snapshotBlock', type: ABIDataTypes.UINT256 },
        { name: 'currentBlock', type: ABIDataTypes.UINT256 }, { name: 'kingAddress', type: ABIDataTypes.ADDRESS },
        { name: 'kingStreak', type: ABIDataTypes.UINT256 }, { name: 'lastWinner', type: ABIDataTypes.ADDRESS },
        { name: 'lastPot', type: ABIDataTypes.UINT256 }, { name: 'settled', type: ABIDataTypes.BOOL },
        { name: 'purchaseCount', type: ABIDataTypes.UINT256 },
    ], type: BitcoinAbiTypes.Function },
    ...OP_NET_ABI,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getState() {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network);
    const s = await contract.getState();
    if ('error' in s) throw new Error(s.error);
    return s.properties;
}

async function trySettle(purchaseCount) {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);

    console.log(`  Searching ${purchaseCount} purchase entries for winner...`);
    for (let i = 0; i < purchaseCount; i++) {
        try {
            const sim = await contract.settle(BigInt(i));
            if (!('error' in sim)) {
                console.log(`  Found winning entry at index ${i}!`);
                console.log('  Sending settle TX...');

                const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
                const tx = await sim.sendTransaction({
                    signer: wallet.keypair,
                    mldsaSigner: wallet.mldsaKeypair,
                    refundTo: wallet.p2tr,
                    utxos,
                    maximumAllowedSatToSpend: 100_000n,
                    feeRate: 10,
                    network,
                });
                return tx?.transactionId ?? null;
            }
        } catch (e) {
            // This index doesn't contain the winner, try next
        }
    }
    return null;
}

console.log('=== KingDick Auto-Settler ===');
console.log('Settler wallet:', wallet.p2tr);
console.log('Contract:', CONTRACT);
console.log('Polling every', POLL_INTERVAL / 1000, 'seconds\n');

while (true) {
    try {
        const state = await getState();
        const blocksLeft = Number(state.snapshotBlock) - Number(state.currentBlock);
        const pot = (Number(state.totalPot) / 1e18).toFixed(2);
        const purchaseCount = Number(state.purchaseCount);

        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] Block ${state.currentBlock} | Tickets: ${state.totalTickets} | Pot: ${pot} MOTO | Settled: ${state.settled}`);

        if (state.settled) {
            console.log('  Cycle already settled. Waiting for next cycle...');
        } else if (blocksLeft > 0) {
            console.log(`  ${blocksLeft} blocks until settlement available`);
        } else if (Number(state.totalTickets) === 0) {
            console.log('  No tickets to settle');
        } else {
            console.log('  >>> SETTLEMENT AVAILABLE! Attempting settle...');
            const txId = await trySettle(purchaseCount);
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
