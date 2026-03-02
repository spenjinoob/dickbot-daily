import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import fs from 'fs';

// Load test wallets
const wallets = JSON.parse(fs.readFileSync('/home/vibecode/motocatroulette1.1/.test-wallets.json', 'utf-8'));
const wallet0 = wallets[0];

const network = networks.opnetTestnet;
const rpcUrl = 'https://testnet.opnet.org';
const CONTRACT = 'opt1sqpdsfg3zvjl42u67yhn3g06tx78ka5neagv9e78d';
const MOTO_ADDRESS = 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds';

const KingDickAbi = [
    {
        name: 'buyTickets',
        inputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'settle',
        inputs: [{ name: 'purchaseIndex', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'winner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
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
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMyTickets',
        inputs: [{ name: 'wallet', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...OP_NET_ABI,
];

console.log('=== KingDick Contract Test ===\n');

// 1. Create wallet from mnemonic
console.log('[1] Deriving wallet from mnemonic (index 0)...');
const mnemonic = new Mnemonic(wallet0.phrase, '', network);
const wallet = mnemonic.deriveOPWallet();
console.log('  P2TR:', wallet.p2tr);
console.log('  Address hex:', wallet.address.toHex());

// 2. Connect to testnet RPC
console.log('\n[2] Connecting to testnet RPC...');
const provider = new JSONRpcProvider({ url: rpcUrl, network });

// 3. Check BTC balance
console.log('\n[3] Checking BTC balance...');
try {
    const balance = await provider.getBalance(wallet.p2tr);
    console.log('  BTC balance:', balance.toString(), 'sat');
} catch (e) {
    console.log('  Balance check failed:', e.message);
}

// 4. Check MOTO balance
console.log('\n[4] Checking MOTO balance...');
try {
    const motoContract = getContract(MOTO_ADDRESS, OP_20_ABI, provider, network, wallet.address);
    const balResult = await motoContract.balanceOf(wallet.address);
    if ('error' in balResult) {
        console.log('  MOTO balanceOf error:', balResult.error);
    } else {
        const rawBal = balResult.properties.balance;
        console.log('  MOTO balance (raw):', rawBal.toString());
        console.log('  MOTO balance (formatted):', (Number(rawBal) / 1e18).toFixed(2), 'MOTO');
    }
} catch (e) {
    console.log('  MOTO check failed:', e.message);
}

// 5. Read contract state
console.log('\n[5] Reading contract state (getState)...');
try {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network);
    const stateResult = await contract.getState();
    if ('error' in stateResult) {
        console.log('  getState error:', stateResult.error);
    } else {
        const p = stateResult.properties;
        console.log('  Cycle ID:', p.cycleId.toString());
        console.log('  Total Tickets:', p.totalTickets.toString());
        console.log('  Total Pot (raw):', p.totalPot.toString());
        console.log('  Total Pot:', (Number(p.totalPot) / 1e18).toFixed(2), 'MOTO');
        console.log('  Snapshot Block:', p.snapshotBlock.toString());
        console.log('  Current Block:', p.currentBlock.toString());
        console.log('  King Streak:', p.kingStreak.toString());
        console.log('  Settled:', p.settled);
        console.log('  Purchase Count:', p.purchaseCount.toString());
    }
} catch (e) {
    console.log('  getState failed:', e.message);
}

// 6. Simulate buyTickets
console.log('\n[6] Simulating buyTickets(1)...');
try {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
    const buySim = await contract.buyTickets(1n);
    if ('error' in buySim) {
        console.log('  buyTickets error:', buySim.error);
    } else {
        console.log('  buyTickets succeeded!');
        console.log('  Tickets this cycle:', buySim.properties.ticketsThisCycle.toString());
    }
} catch (e) {
    console.log('  buyTickets failed:', e.message?.slice(0, 300));
}

// 7. Read my tickets
console.log('\n[7] Reading my tickets (getMyTickets)...');
try {
    const contract = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
    const ticketResult = await contract.getMyTickets(wallet.address);
    if ('error' in ticketResult) {
        console.log('  getMyTickets error:', ticketResult.error);
    } else {
        console.log('  Tickets this cycle:', ticketResult.properties.ticketsThisCycle.toString());
    }
} catch (e) {
    console.log('  getMyTickets failed:', e.message?.slice(0, 300));
}

console.log('\n=== Test Complete ===');

// Cleanup
mnemonic.zeroize();
wallet.zeroize();
await provider.close();
