import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    StoredBoolean,
    StoredMapU256,
    StoredU256,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { ADDRESS_BYTE_LENGTH, U256_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime/utils';

const SNAPSHOT_OFFSET: u256 = u256.fromU64(135);
const REVEAL_WINDOW: u256 = u256.fromU64(10);

// Storage pointers — auto-assigned via Blockchain.nextPointer
const PTR_CYCLE_ID:          u16 = Blockchain.nextPointer;
const PTR_CYCLE_START:       u16 = Blockchain.nextPointer;
const PTR_TOTAL_TICKETS:     u16 = Blockchain.nextPointer;
const PTR_TOTAL_POT:         u16 = Blockchain.nextPointer;
const PTR_SETTLED:           u16 = Blockchain.nextPointer;
const PTR_KING_ADDR:         u16 = Blockchain.nextPointer;
const PTR_KING_STREAK:       u16 = Blockchain.nextPointer;
const PTR_LAST_WINNER:       u16 = Blockchain.nextPointer;
const PTR_LAST_POT:          u16 = Blockchain.nextPointer;
const PTR_TICKETS_MAP:       u16 = Blockchain.nextPointer;
const PTR_PURCHASE_COUNT:    u16 = Blockchain.nextPointer;
const PTR_PURCHASE_END_MAP:  u16 = Blockchain.nextPointer;
const PTR_PURCHASE_BUYER_MAP:u16 = Blockchain.nextPointer;
const PTR_COMMIT_HASH:       u16 = Blockchain.nextPointer;
const PTR_COMMIT_BLOCK:      u16 = Blockchain.nextPointer;
const PTR_COMMITTER:         u16 = Blockchain.nextPointer;
const PTR_COMMIT_BLOCK_HASH: u16 = Blockchain.nextPointer;

// ── Events ──────────────────────────────────────────────────────────────────────

@final
class TicketsPurchasedEvent extends NetEvent {
    constructor(buyer: Address, count: u256, totalCost: u256, cycleId: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH * 3,
        );
        data.writeAddress(buyer);
        data.writeU256(count);
        data.writeU256(totalCost);
        data.writeU256(cycleId);
        super('TicketsPurchased', data);
    }
}

@final
class CycleSettledEvent extends NetEvent {
    constructor(winner: Address, pot: u256, settler: Address, cycleId: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U256_BYTE_LENGTH * 2,
        );
        data.writeAddress(winner);
        data.writeU256(pot);
        data.writeAddress(settler);
        data.writeU256(cycleId);
        super('CycleSettled', data);
    }
}

// ── Contract ────────────────────────────────────────────────────────────────────

@final
export class KingDick extends OP_NET {

    // ── Lazy-loaded storage ─────────────────────────────────────────────────────
    private _cycleId:          StoredU256    | null = null;
    private _cycleStart:       StoredU256    | null = null;
    private _totalTickets:     StoredU256    | null = null;
    private _totalPot:         StoredU256    | null = null;
    private _settled:          StoredBoolean | null = null;
    private _kingAddr:         StoredU256    | null = null;
    private _kingStreak:       StoredU256    | null = null;
    private _lastWinner:       StoredU256    | null = null;
    private _lastPot:          StoredU256    | null = null;
    private _ticketsMap:       StoredMapU256 | null = null;
    private _purchaseCount:    StoredU256    | null = null;
    private _purchaseEndMap:   StoredMapU256 | null = null;
    private _purchaseBuyerMap: StoredMapU256 | null = null;
    private _commitHash:       StoredU256    | null = null;
    private _commitBlock:      StoredU256    | null = null;
    private _committer:        StoredU256    | null = null;
    private _commitBlockHash:  StoredU256    | null = null;

    private get cycleId():          StoredU256    { if (!this._cycleId)          this._cycleId          = new StoredU256(PTR_CYCLE_ID,          EMPTY_POINTER); return this._cycleId!; }
    private get cycleStart():       StoredU256    { if (!this._cycleStart)       this._cycleStart       = new StoredU256(PTR_CYCLE_START,       EMPTY_POINTER); return this._cycleStart!; }
    private get totalTickets():     StoredU256    { if (!this._totalTickets)     this._totalTickets     = new StoredU256(PTR_TOTAL_TICKETS,     EMPTY_POINTER); return this._totalTickets!; }
    private get totalPot():         StoredU256    { if (!this._totalPot)         this._totalPot         = new StoredU256(PTR_TOTAL_POT,         EMPTY_POINTER); return this._totalPot!; }
    private get settled():          StoredBoolean { if (!this._settled)          this._settled          = new StoredBoolean(PTR_SETTLED,        false);         return this._settled!; }
    private get kingAddr():         StoredU256    { if (!this._kingAddr)         this._kingAddr         = new StoredU256(PTR_KING_ADDR,         EMPTY_POINTER); return this._kingAddr!; }
    private get kingStreak():       StoredU256    { if (!this._kingStreak)       this._kingStreak       = new StoredU256(PTR_KING_STREAK,       EMPTY_POINTER); return this._kingStreak!; }
    private get lastWinner():       StoredU256    { if (!this._lastWinner)       this._lastWinner       = new StoredU256(PTR_LAST_WINNER,       EMPTY_POINTER); return this._lastWinner!; }
    private get lastPot():          StoredU256    { if (!this._lastPot)          this._lastPot          = new StoredU256(PTR_LAST_POT,          EMPTY_POINTER); return this._lastPot!; }
    private get ticketsMap():       StoredMapU256 { if (!this._ticketsMap)       this._ticketsMap       = new StoredMapU256(PTR_TICKETS_MAP);                   return this._ticketsMap!; }
    private get purchaseCount():    StoredU256    { if (!this._purchaseCount)    this._purchaseCount    = new StoredU256(PTR_PURCHASE_COUNT,    EMPTY_POINTER); return this._purchaseCount!; }
    private get purchaseEndMap():   StoredMapU256 { if (!this._purchaseEndMap)   this._purchaseEndMap   = new StoredMapU256(PTR_PURCHASE_END_MAP);              return this._purchaseEndMap!; }
    private get purchaseBuyerMap(): StoredMapU256 { if (!this._purchaseBuyerMap) this._purchaseBuyerMap = new StoredMapU256(PTR_PURCHASE_BUYER_MAP);            return this._purchaseBuyerMap!; }
    private get commitHash():       StoredU256    { if (!this._commitHash)       this._commitHash       = new StoredU256(PTR_COMMIT_HASH,       EMPTY_POINTER); return this._commitHash!; }
    private get commitBlock():      StoredU256    { if (!this._commitBlock)      this._commitBlock      = new StoredU256(PTR_COMMIT_BLOCK,      EMPTY_POINTER); return this._commitBlock!; }
    private get committer():        StoredU256    { if (!this._committer)        this._committer        = new StoredU256(PTR_COMMITTER,         EMPTY_POINTER); return this._committer!; }
    private get commitBlockHash():  StoredU256    { if (!this._commitBlockHash)  this._commitBlockHash  = new StoredU256(PTR_COMMIT_BLOCK_HASH, EMPTY_POINTER); return this._commitBlockHash!; }

    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {}

    @method({ name: 'count', type: ABIDataTypes.UINT256 })
    @returns({ name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 })
    @emit('TicketsPurchased')
    public buyTickets(calldata: Calldata): BytesWriter {
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        const count = calldata.readU256();
        if (u256.eq(count, u256.Zero)) throw new Revert('Count > 0');
        if (u256.gt(count, u256.fromU64(10000))) throw new Revert('Max 10000');

        if (u256.eq(this.cycleId.value, u256.Zero)) {
            this.cycleId.value    = u256.fromU64(1);
            this.cycleStart.value = Blockchain.block.numberU256;
        }

        const buyer          = Blockchain.tx.sender;
        const snapshotBlock  = SafeMath.add(this.cycleStart.value, SNAPSHOT_OFFSET);
        const totalCost      = SafeMath.mul(count, u256.fromString('50000000000000000000'));
        const currentCycleId = this.cycleId.value;

        if (!u256.lt(Blockchain.block.numberU256, snapshotBlock)) throw new Revert('Cycle closed');

        const cycleKey = this._key(currentCycleId, buyer);

        // Effects: update all state BEFORE interaction
        this.ticketsMap.set(cycleKey, SafeMath.add(this.ticketsMap.get(cycleKey), count));
        const newTotal = SafeMath.add(this.totalTickets.value, count);
        this.totalTickets.value = newTotal;
        this.totalPot.value     = SafeMath.add(this.totalPot.value, totalCost);

        // Purchase log: record this purchase entry
        const pIdx = this.purchaseCount.value;
        this.purchaseEndMap.set(pIdx, newTotal);
        this.purchaseBuyerMap.set(pIdx, this._addrToU256(buyer));
        this.purchaseCount.value = SafeMath.inc(pIdx);

        // Interaction: token transfer LAST (checks-effects-interactions)
        TransferHelper.transferFrom(this._moto(), buyer, Blockchain.contractAddress, totalCost);

        this.emitEvent(new TicketsPurchasedEvent(buyer, count, totalCost, currentCycleId));

        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.ticketsMap.get(cycleKey));
        return w;
    }

    @method({ name: 'commitHash', type: ABIDataTypes.UINT256 })
    @returns({ name: 'commitBlock', type: ABIDataTypes.UINT256 })
    public commitSettle(calldata: Calldata): BytesWriter {
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        const hash = calldata.readU256();
        if (u256.eq(hash, u256.Zero)) throw new Revert('Bad hash');

        const currentCycleId = this.cycleId.value;
        if (u256.eq(currentCycleId, u256.Zero)) throw new Revert('No cycle');

        const snapshotBlock = SafeMath.add(this.cycleStart.value, SNAPSHOT_OFFSET);
        if (u256.lt(Blockchain.block.numberU256, snapshotBlock)) throw new Revert('Too early');
        if (this.settled.value) throw new Revert('Settled');

        // If there's an existing commit, only allow if it's expired
        if (!u256.eq(this.commitHash.value, u256.Zero)) {
            const deadline = SafeMath.add(this.commitBlock.value, REVEAL_WINDOW);
            if (!u256.gt(Blockchain.block.numberU256, deadline)) {
                throw new Revert('Already committed');
            }
            // Expired — clear it inline and proceed with new commit
            this.commitHash.value      = u256.Zero;
            this.commitBlock.value     = u256.Zero;
            this.committer.value       = u256.Zero;
            this.commitBlockHash.value = u256.Zero;
        }

        this.commitHash.value      = hash;
        this.commitBlock.value     = Blockchain.block.numberU256;
        this.committer.value       = this._addrToU256(Blockchain.tx.sender);
        this.commitBlockHash.value = u256.fromBytes(Blockchain.block.hash, true);

        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(Blockchain.block.numberU256);
        return w;
    }

    @method(
        { name: 'secret', type: ABIDataTypes.UINT256 },
        { name: 'purchaseIndex', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'winner', type: ABIDataTypes.ADDRESS })
    @emit('CycleSettled')
    public revealSettle(calldata: Calldata): BytesWriter {
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        const secret        = calldata.readU256();
        const purchaseIndex = calldata.readU256();

        const currentCycleId = this.cycleId.value;
        if (u256.eq(currentCycleId, u256.Zero)) throw new Revert('No cycle');
        if (this.settled.value) throw new Revert('Settled');

        // Verify commit exists
        const storedCommitHash = this.commitHash.value;
        if (u256.eq(storedCommitHash, u256.Zero)) throw new Revert('No commit');

        // Verify caller is the committer
        const caller = Blockchain.tx.sender;
        if (!u256.eq(this._addrToU256(caller), this.committer.value)) {
            throw new Revert('Not committer');
        }

        // Verify reveal is within window (must be at least 1 block after commit)
        const cBlock = this.commitBlock.value;
        if (!u256.gt(Blockchain.block.numberU256, cBlock)) throw new Revert('Same block');
        const deadline = SafeMath.add(cBlock, REVEAL_WINDOW);
        if (u256.gt(Blockchain.block.numberU256, deadline)) {
            // Reveal expired — revert (commit gets cleared in next commitSettle call)
            throw new Revert('Reveal expired');
        }

        // Verify secret matches commitment: sha256(secret) == commitHash
        const secretBytes = secret.toUint8Array(true);
        const computedHash = u256.fromBytes(Blockchain.sha256(secretBytes), true);
        if (!u256.eq(computedHash, storedCommitHash)) throw new Revert('Bad secret');

        const totalTickets = this.totalTickets.value;
        if (u256.eq(totalTickets, u256.Zero)) {
            this._advance();
            const w = new BytesWriter(ADDRESS_BYTE_LENGTH);
            w.writeAddress(Address.zero());
            return w;
        }

        // Verify purchaseIndex is in range
        if (u256.ge(purchaseIndex, this.purchaseCount.value)) throw new Revert('Bad index');

        // RNG: sha256(secret + commitBlockHash) — neither settler nor miner controls both
        // Settler chose secret before commit block was mined; miner didn't know secret
        const storedBlockHash = this.commitBlockHash.value.toUint8Array(true);
        const seed = new Uint8Array(64);
        memory.copy(seed.dataStart, secretBytes.dataStart, 32);
        memory.copy(seed.dataStart + 32, storedBlockHash.dataStart, 32);
        const winningTicket = this._hashMod(Blockchain.sha256(seed), totalTickets);

        // Verify the purchase entry covers the winning ticket
        const endTicket = this.purchaseEndMap.get(purchaseIndex);
        const startTicket: u256 = u256.eq(purchaseIndex, u256.Zero)
            ? u256.Zero
            : this.purchaseEndMap.get(SafeMath.sub(purchaseIndex, u256.fromU64(1)));

        if (u256.lt(winningTicket, startTicket) || u256.ge(winningTicket, endTicket)) {
            throw new Revert('Wrong index');
        }

        const winner = this._u256ToAddr(this.purchaseBuyerMap.get(purchaseIndex));

        const totalPot   = this.totalPot.value;
        const settlerAmt = SafeMath.div(SafeMath.mul(totalPot, u256.fromU64(2)),   u256.fromU64(1000));
        const remainder  = SafeMath.sub(totalPot, settlerAmt);
        const winnerAmt  = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(850)), u256.fromU64(1000));
        const stakingAmt = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(100)), u256.fromU64(1000));
        const devAmt     = SafeMath.sub(SafeMath.sub(remainder, winnerAmt), stakingAmt);

        // Effects: state updates BEFORE transfers
        this.settled.value    = true;
        this.lastWinner.value = this._addrToU256(winner);
        this.lastPot.value    = totalPot;

        const prevKing = this._u256ToAddr(this.kingAddr.value);
        this.kingAddr.value   = this._addrToU256(winner);
        this.kingStreak.value = winner.equals(prevKing)
            ? SafeMath.inc(this.kingStreak.value)
            : u256.fromU64(1);

        // Interactions: token transfers LAST
        TransferHelper.transfer(this._moto(), caller, settlerAmt);
        TransferHelper.transfer(this._moto(), winner, winnerAmt);
        TransferHelper.transfer(this._moto(), this._staking(), stakingAmt);
        TransferHelper.transfer(this._moto(), this._dev(), devAmt);

        this.emitEvent(new CycleSettledEvent(winner, totalPot, caller, currentCycleId));

        this._advance();
        const w = new BytesWriter(ADDRESS_BYTE_LENGTH);
        w.writeAddress(winner);
        return w;
    }

    @method()
    @returns(
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
    )
    public getState(_calldata: Calldata): BytesWriter {
        const snap = SafeMath.add(this.cycleStart.value, SNAPSHOT_OFFSET);
        // 9x u256 (288) + 2x address (64) + 1x bool (1) = 353 bytes
        const w = new BytesWriter(353);
        w.writeU256(this.cycleId.value);
        w.writeU256(this.totalTickets.value);
        w.writeU256(this.totalPot.value);
        w.writeU256(snap);
        w.writeU256(Blockchain.block.numberU256);
        w.writeAddress(this._u256ToAddr(this.kingAddr.value));
        w.writeU256(this.kingStreak.value);
        w.writeAddress(this._u256ToAddr(this.lastWinner.value));
        w.writeU256(this.lastPot.value);
        w.writeBoolean(this.settled.value);
        w.writeU256(this.purchaseCount.value);
        w.writeU256(this.commitBlock.value);
        return w;
    }

    @method({ name: 'wallet', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'tickets', type: ABIDataTypes.UINT256 })
    public getMyTickets(calldata: Calldata): BytesWriter {
        const wallet = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.ticketsMap.get(this._key(this.cycleId.value, wallet)));
        return w;
    }

    private _advance(): void {
        this.cycleId.value        = SafeMath.inc(this.cycleId.value);
        this.cycleStart.value     = Blockchain.block.numberU256;
        this.settled.value        = false;
        this.totalTickets.value   = u256.Zero;
        this.totalPot.value       = u256.Zero;
        this.purchaseCount.value  = u256.Zero;
        this.commitHash.value      = u256.Zero;
        this.commitBlock.value     = u256.Zero;
        this.committer.value       = u256.Zero;
        this.commitBlockHash.value = u256.Zero;
    }

    private _hashMod(hash: Uint8Array, total: u256): u256 {
        return SafeMath.mod(u256.fromBytes(hash, true), total);
    }

    private _key(cycleId: u256, wallet: Address): u256 {
        const b = new Uint8Array(64);
        const cid = cycleId.toUint8Array(true);
        memory.copy(b.dataStart, cid.dataStart, 32);
        memory.copy(b.dataStart + 32, wallet.dataStart, 32);
        return u256.fromBytes(Blockchain.sha256(b), true);
    }

    private _addrToU256(addr: Address): u256 {
        const tmp = new Uint8Array(32);
        memory.copy(tmp.dataStart, addr.dataStart, 32);
        return u256.fromBytes(tmp, true);
    }

    private _u256ToAddr(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    // MOTO token: fd447384 0751d58d 9f8b73bd d57d6c52 60453d55 18bd7cd0 2d0a4cf3 df9bf4dd
    // bech32: opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds
    private _moto(): Address {
        const b = new Uint8Array(32);
        b[0]=253;b[1]=68;b[2]=115;b[3]=132;b[4]=7;b[5]=81;b[6]=213;b[7]=141;b[8]=159;b[9]=139;b[10]=115;b[11]=189;b[12]=213;b[13]=125;b[14]=108;b[15]=82;b[16]=96;b[17]=69;b[18]=61;b[19]=85;b[20]=24;b[21]=189;b[22]=124;b[23]=208;b[24]=45;b[25]=10;b[26]=76;b[27]=243;b[28]=223;b[29]=155;b[30]=244;b[31]=221;
        return Address.fromUint8Array(b);
    }

    // Staking: 831ca1f8 ebcc1925 be9aa3a2 2fd3c5c4 bf7d03a8 6c66c391 94fef698 acb886ae
    private _staking(): Address {
        const b = new Uint8Array(32);
        b[0]=131;b[1]=28;b[2]=161;b[3]=248;b[4]=235;b[5]=204;b[6]=25;b[7]=37;b[8]=190;b[9]=154;b[10]=163;b[11]=162;b[12]=47;b[13]=211;b[14]=197;b[15]=196;b[16]=191;b[17]=125;b[18]=3;b[19]=168;b[20]=108;b[21]=102;b[22]=195;b[23]=145;b[24]=148;b[25]=254;b[26]=246;b[27]=152;b[28]=172;b[29]=184;b[30]=134;b[31]=174;
        return Address.fromUint8Array(b);
    }

    // Dev fee: opt1p47h427fs9t2d36j7yggdfg4crr5plwpw7ww5e7rh7rd2wjy73jnqh5jdg0
    private _dev(): Address {
        const b = new Uint8Array(32);
        b[0]=175;b[1]=175;b[2]=85;b[3]=121;b[4]=48;b[5]=42;b[6]=212;b[7]=216;b[8]=234;b[9]=94;b[10]=34;b[11]=16;b[12]=212;b[13]=162;b[14]=184;b[15]=24;b[16]=232;b[17]=31;b[18]=184;b[19]=46;b[20]=243;b[21]=157;b[22]=76;b[23]=248;b[24]=119;b[25]=240;b[26]=218;b[27]=167;b[28]=72;b[29]=158;b[30]=140;b[31]=166;
        return Address.fromUint8Array(b);
    }
}
