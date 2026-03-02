import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const CONTRACT = 'opt1sqpdsfg3zvjl42u67yhn3g06tx78ka5neagv9e78d';

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

const contract = getContract(CONTRACT, KingDickAbi, provider, network);

console.log('Reading state...');
const state = await contract.getState();
if ('error' in state) {
    console.log('State error:', state.error);
    await provider.close();
    process.exit(1);
}

const p = state.properties;
console.log('Cycle:', p.cycleId.toString(), '| Tickets:', p.totalTickets.toString(), '| Pot:', (Number(p.totalPot) / 1e18).toFixed(2), 'MOTO');
console.log('Snapshot block:', p.snapshotBlock.toString(), '| Current block:', p.currentBlock.toString());
console.log('Settled:', p.settled, '| Purchases:', p.purchaseCount.toString());

const ready = !p.settled && Number(p.totalTickets) > 0 && Number(p.currentBlock) >= Number(p.snapshotBlock);

if (ready) {
    const purchaseCount = Number(p.purchaseCount);
    console.log('\nCycle is ready for settlement! Trying all', purchaseCount, 'purchase indices...');
    for (let i = 0; i < purchaseCount; i++) {
        try {
            const sim = await contract.settle(BigInt(i));
            if ('error' in sim) {
                console.log(`  Index ${i}: error -`, sim.error);
            } else {
                console.log(`  Index ${i}: SUCCESS! Winner:`, sim.properties.winner);
                break;
            }
        } catch (e) {
            console.log(`  Index ${i}: failed -`, e.message?.slice(0, 300));
        }
    }
} else {
    console.log('\nCycle not ready for settlement');
    if (p.settled) console.log('  Reason: already settled');
    else if (Number(p.totalTickets) === 0) console.log('  Reason: no tickets');
    else console.log('  Reason:', Number(p.snapshotBlock) - Number(p.currentBlock), 'blocks remaining');
}

await provider.close();
