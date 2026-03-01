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
        tickets: bigint;
    },
    OPNetEvent<TicketsPurchasedEvent>[]
>;

/**
 * @description Represents the result of the settle function call.
 */
export type Settle = CallResult<
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
        state: Uint8Array;
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
    settle(purchaseIndex: bigint): Promise<Settle>;
    getState(): Promise<GetState>;
    getMyTickets(wallet: Address): Promise<GetMyTickets>;
}
