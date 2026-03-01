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
        outputs: [{ name: 'tickets', type: ABIDataTypes.UINT256 }],
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
        outputs: [{ name: 'state', type: ABIDataTypes.BYTES32 }],
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
