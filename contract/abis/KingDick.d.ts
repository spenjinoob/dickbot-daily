import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

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
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the settle function call.
 */
export type Settle = CallResult<
    {
        winner: Address;
    },
    OPNetEvent<never>[]
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
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMyTickets function call.
 */
export type GetMyTickets = CallResult<
    {
        ticketsThisCycle: bigint;
        rolloverTickets: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IKingDick
// ------------------------------------------------------------------
export interface IKingDick extends IOP_NETContract {
    buyTickets(count: bigint): Promise<BuyTickets>;
    settle(claimedWinner: Address, claimedTicketIndex: bigint): Promise<Settle>;
    getState(): Promise<GetState>;
    getMyTickets(wallet: Address): Promise<GetMyTickets>;
}
