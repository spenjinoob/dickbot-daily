import type { Address } from '@btc-vision/transaction';
import type { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

export type BuyTickets = CallResult<
    { ticketsThisCycle: bigint },
    OPNetEvent<never>[]
>;

export type CommitSettle = CallResult<
    { commitBlock: bigint },
    OPNetEvent<never>[]
>;

export type RevealSettle = CallResult<
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
        purchaseCount: bigint;
        commitBlock: bigint;
    },
    OPNetEvent<never>[]
>;

export type GetMyTickets = CallResult<
    {
        ticketsThisCycle: bigint;
    },
    OPNetEvent<never>[]
>;

export interface IKingDick extends IOP_NETContract {
    buyTickets(count: bigint): Promise<BuyTickets>;
    commitSettle(commitHash: bigint): Promise<CommitSettle>;
    revealSettle(secret: bigint, purchaseIndex: bigint): Promise<RevealSettle>;
    getState(): Promise<GetState>;
    getMyTickets(wallet: Address): Promise<GetMyTickets>;
}

export interface GameState {
    cycleId: bigint;
    totalTickets: bigint;
    totalPot: bigint;
    snapshotBlock: bigint;
    currentBlock: bigint;
    kingAddress: string;
    kingStreak: bigint;
    lastWinner: string;
    lastPot: bigint;
    settled: boolean;
    purchaseCount: bigint;
    commitBlock: bigint;
}

export interface MyTickets {
    ticketsThisCycle: bigint;
}
