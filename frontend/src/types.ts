import type { Address } from '@btc-vision/transaction';
import type { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

export type BuyTickets = CallResult<
    { ticketsThisCycle: bigint },
    OPNetEvent<never>[]
>;

export type Settle = CallResult<
    { winner: Address },
    OPNetEvent<never>[]
>;

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

export type GetMyTickets = CallResult<
    {
        ticketsThisCycle: bigint;
        rolloverTickets: bigint;
    },
    OPNetEvent<never>[]
>;

export interface IKingDick extends IOP_NETContract {
    buyTickets(count: bigint): Promise<BuyTickets>;
    settle(claimedWinner: Address, claimedTicketIndex: bigint): Promise<Settle>;
    getState(): Promise<GetState>;
    getMyTickets(wallet: Address): Promise<GetMyTickets>;
}

export interface GameState {
    cycleId: number;
    totalTickets: number;
    totalPot: bigint;
    snapshotBlock: number;
    currentBlock: number;
    kingAddress: string;
    kingStreak: number;
    lastWinner: string;
    lastPot: bigint;
    settled: boolean;
}

export interface MyTickets {
    ticketsThisCycle: number;
    rolloverTickets: number;
}
