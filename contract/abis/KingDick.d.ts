import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type TicketsPurchasedEvent = {
    readonly buyer: Address;
    readonly count: bigint;
    readonly totalCost: bigint;
    readonly cycleId: bigint;
};
export type CycleSettledEvent = {
    readonly winner: Address;
    readonly pot: bigint;
    readonly settler: Address;
    readonly cycleId: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the buyTickets function call.
 */
export type BuyTickets = CallResult<
    {
        ticketsThisCycle: bigint;
    },
    OPNetEvent<TicketsPurchasedEvent>[]
>;

/**
 * @description Represents the result of the commitSettle function call.
 */
export type CommitSettle = CallResult<
    {
        commitBlock: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the revealSettle function call.
 */
export type RevealSettle = CallResult<
    {
        winner: Address;
    },
    OPNetEvent<CycleSettledEvent>[]
>;

/**
 * @description Represents the result of the getState function call.
 */
export type GetState = CallResult<
    {
        cycleId: bigint;
        totalTickets: bigint;
        totalPot: bigint;
        snapshotBlock: bigint;
        currentBlock: bigint;
        kingAddress: Address;
        kingStreak: bigint;
        lastWinner: Address;
        lastPot: bigint;
        settled: boolean;
        purchaseCount: bigint;
        commitBlock: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMyTickets function call.
 */
export type GetMyTickets = CallResult<
    {
        tickets: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IKingDick
// ------------------------------------------------------------------
export interface IKingDick extends IOP_NETContract {
    buyTickets(count: bigint): Promise<BuyTickets>;
    commitSettle(commitHash: bigint): Promise<CommitSettle>;
    revealSettle(secret: bigint, purchaseIndex: bigint): Promise<RevealSettle>;
    getState(): Promise<GetState>;
    getMyTickets(wallet: Address): Promise<GetMyTickets>;
}
