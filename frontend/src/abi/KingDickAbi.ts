import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const KingDickAbi: BitcoinInterfaceAbi = [
    {
        name: 'buyTickets',
        inputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'settle',
        inputs: [
            { name: 'claimedWinner', type: ABIDataTypes.ADDRESS },
            { name: 'claimedTicketIndex', type: ABIDataTypes.UINT256 },
        ],
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
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMyTickets',
        inputs: [{ name: 'wallet', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 },
            { name: 'rolloverTickets', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...OP_NET_ABI,
];

export default KingDickAbi;
