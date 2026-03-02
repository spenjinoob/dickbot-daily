import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const KingDickEvents = [
    {
        name: 'TicketsPurchased',
        values: [
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'count', type: ABIDataTypes.UINT256 },
            { name: 'totalCost', type: ABIDataTypes.UINT256 },
            { name: 'cycleId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'CycleSettled',
        values: [
            { name: 'winner', type: ABIDataTypes.ADDRESS },
            { name: 'pot', type: ABIDataTypes.UINT256 },
            { name: 'settler', type: ABIDataTypes.ADDRESS },
            { name: 'cycleId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const KingDickAbi = [
    {
        name: 'buyTickets',
        inputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'commitSettle',
        inputs: [{ name: 'commitHash', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'commitBlock', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revealSettle',
        inputs: [
            { name: 'secret', type: ABIDataTypes.UINT256 },
            { name: 'purchaseIndex', type: ABIDataTypes.UINT256 },
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
            { name: 'purchaseCount', type: ABIDataTypes.UINT256 },
            { name: 'commitBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMyTickets',
        inputs: [{ name: 'wallet', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'tickets', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...KingDickEvents,
    ...OP_NET_ABI,
];

export default KingDickAbi;
