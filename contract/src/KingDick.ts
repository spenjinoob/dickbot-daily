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

const SNAPSHOT_OFFSET: u64 = 5;

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
const PTR_ROLLOVER_MAP:      u16 = Blockchain.nextPointer;
const PTR_PURCHASE_COUNT:    u16 = Blockchain.nextPointer;
const PTR_PURCHASE_END_MAP:  u16 = Blockchain.nextPointer;
const PTR_PURCHASE_BUYER_MAP:u16 = Blockchain.nextPointer;

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
    private _rolloverMap:      StoredMapU256 | null = null;
    private _purchaseCount:    StoredU256    | null = null;
    private _purchaseEndMap:   StoredMapU256 | null = null;
    private _purchaseBuyerMap: StoredMapU256 | null = null;

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
    private get rolloverMap():      StoredMapU256 { if (!this._rolloverMap)      this._rolloverMap      = new StoredMapU256(PTR_ROLLOVER_MAP);                  return this._rolloverMap!; }
    private get purchaseCount():    StoredU256    { if (!this._purchaseCount)    this._purchaseCount    = new StoredU256(PTR_PURCHASE_COUNT,    EMPTY_POINTER); return this._purchaseCount!; }
    private get purchaseEndMap():   StoredMapU256 { if (!this._purchaseEndMap)   this._purchaseEndMap   = new StoredMapU256(PTR_PURCHASE_END_MAP);              return this._purchaseEndMap!; }
    private get purchaseBuyerMap(): StoredMapU256 { if (!this._purchaseBuyerMap) this._purchaseBuyerMap = new StoredMapU256(PTR_PURCHASE_BUYER_MAP);            return this._purchaseBuyerMap!; }

    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {}

    @method({ name: 'count', type: ABIDataTypes.UINT256 })
    @returns({ name: 'tickets', type: ABIDataTypes.UINT256 })
    @emit('TicketsPurchased')
    public buyTickets(calldata: Calldata): BytesWriter {
        const count = calldata.readU256();
        if (u256.eq(count, u256.Zero)) throw new Revert('Count > 0');

        if (u256.eq(this.cycleId.value, u256.Zero)) {
            this.cycleId.value    = u256.fromU64(1);
            this.cycleStart.value = Blockchain.block.numberU256;
        }

        const buyer          = Blockchain.tx.sender;
        const snapshotBlock: u64 = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        const totalCost      = SafeMath.mul(count, u256.fromString('50000000000000000000'));
        const currentCycleId = this.cycleId.value;

        const cycleKey = this._key(currentCycleId, buyer);

        if (Blockchain.block.number < snapshotBlock) {
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
        } else {
            const wk = this._wkey(buyer);
            this.rolloverMap.set(wk, SafeMath.add(this.rolloverMap.get(wk), count));
        }

        // Interaction: token transfer LAST (checks-effects-interactions)
        TransferHelper.transferFrom(this._moto(), buyer, Blockchain.contractAddress, totalCost);

        this.emitEvent(new TicketsPurchasedEvent(buyer, count, totalCost, currentCycleId));

        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.ticketsMap.get(cycleKey));
        return w;
    }

    @method({ name: 'purchaseIndex', type: ABIDataTypes.UINT256 })
    @returns({ name: 'winner', type: ABIDataTypes.ADDRESS })
    @emit('CycleSettled')
    public settle(calldata: Calldata): BytesWriter {
        const purchaseIndex = calldata.readU256();

        const currentCycleId = this.cycleId.value;
        if (u256.eq(currentCycleId, u256.Zero)) throw new Revert('No cycle');

        const snapshotBlock: u64 = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        if (Blockchain.block.number < snapshotBlock) throw new Revert('Too early');
        if (this.settled.value)                      throw new Revert('Settled');

        const totalTickets = this.totalTickets.value;
        if (u256.eq(totalTickets, u256.Zero)) {
            this._advance();
            const w = new BytesWriter(ADDRESS_BYTE_LENGTH);
            w.writeAddress(Address.zero());
            return w;
        }

        // Verify purchaseIndex is in range
        if (u256.ge(purchaseIndex, this.purchaseCount.value)) throw new Revert('Bad index');

        // Compute winning ticket deterministically from current block hash
        // (getBlockHash not implemented in runtime — use settlement block hash)
        const winningTicket = this._hashMod(Blockchain.block.hash, totalTickets);

        // Verify the purchase entry covers the winning ticket
        const endTicket = this.purchaseEndMap.get(purchaseIndex);
        const startTicket: u256 = u256.eq(purchaseIndex, u256.Zero)
            ? u256.Zero
            : this.purchaseEndMap.get(SafeMath.sub(purchaseIndex, u256.fromU64(1)));

        // Must satisfy: startTicket <= winningTicket < endTicket
        if (u256.lt(winningTicket, startTicket) || u256.ge(winningTicket, endTicket)) {
            throw new Revert('Wrong index');
        }

        // Winner is determined on-chain — settler CANNOT choose
        const winner = this._u256ToAddr(this.purchaseBuyerMap.get(purchaseIndex));

        const totalPot   = this.totalPot.value;
        const settlerAmt = SafeMath.div(SafeMath.mul(totalPot, u256.fromU64(2)),   u256.fromU64(1000));
        const remainder  = SafeMath.sub(totalPot, settlerAmt);
        const winnerAmt  = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(850)), u256.fromU64(1000));
        const stakingAmt = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(100)), u256.fromU64(1000));
        const devAmt     = SafeMath.sub(SafeMath.sub(remainder, winnerAmt), stakingAmt);

        const caller = Blockchain.tx.sender;

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
    @returns({ name: 'state', type: ABIDataTypes.BYTES32 })
    public getState(_calldata: Calldata): BytesWriter {
        const snap = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        // 8x u256 (256) + 2x address (64) + 1x bool (1) = 321 bytes
        const w = new BytesWriter(321);
        w.writeU256(this.cycleId.value);
        w.writeU256(this.totalTickets.value);
        w.writeU256(this.totalPot.value);
        w.writeU256(u256.fromU64(snap));
        w.writeU256(Blockchain.block.numberU256);
        w.writeAddress(this._u256ToAddr(this.kingAddr.value));
        w.writeU256(this.kingStreak.value);
        w.writeAddress(this._u256ToAddr(this.lastWinner.value));
        w.writeU256(this.lastPot.value);
        w.writeBoolean(this.settled.value);
        w.writeU256(this.purchaseCount.value);
        return w;
    }

    @method({ name: 'wallet', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'tickets', type: ABIDataTypes.UINT256 })
    public getMyTickets(calldata: Calldata): BytesWriter {
        const wallet = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH * 2);
        w.writeU256(this.ticketsMap.get(this._key(this.cycleId.value, wallet)));
        w.writeU256(this.rolloverMap.get(this._wkey(wallet)));
        return w;
    }

    private _advance(): void {
        this.cycleId.value        = SafeMath.inc(this.cycleId.value);
        this.cycleStart.value     = Blockchain.block.numberU256;
        this.settled.value        = false;
        this.totalTickets.value   = u256.Zero;
        this.totalPot.value       = u256.Zero;
        this.purchaseCount.value  = u256.Zero;
    }

    private _hashMod(hash: Uint8Array, total: u256): u256 {
        let val: u256 = u256.Zero;
        for (let i: i32 = 0; i < 8; i++) {
            val = SafeMath.add(SafeMath.mul(val, u256.fromU64(256)), u256.fromU64(u64(hash[i])));
        }
        return SafeMath.mod(val, total);
    }

    private _key(cycleId: u256, wallet: Address): u256 {
        const b = new Uint8Array(64);
        const cid = cycleId.toUint8Array(true);
        memory.copy(b.dataStart, cid.dataStart, 32);
        memory.copy(b.dataStart + 32, wallet.dataStart, 32);
        return u256.fromBytes(Blockchain.sha256(b), true);
    }

    private _wkey(addr: Address): u256 {
        const tmp = new Uint8Array(32);
        memory.copy(tmp.dataStart, addr.dataStart, 32);
        return u256.fromBytes(tmp, true);
    }

    private _addrToU256(addr: Address): u256 {
        const tmp = new Uint8Array(32);
        memory.copy(tmp.dataStart, addr.dataStart, 32);
        return u256.fromBytes(tmp, true);
    }

    private _u256ToAddr(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    private _moto(): Address {
        const b = new Uint8Array(32);
        b[0]=253;b[1]=68;b[2]=115;b[3]=132;b[4]=7;b[5]=81;b[6]=213;b[7]=141;b[8]=159;b[9]=139;b[10]=115;b[11]=189;b[12]=213;b[13]=125;b[14]=108;b[15]=82;b[16]=96;b[17]=69;b[18]=61;b[19]=85;b[20]=24;b[21]=189;b[22]=124;b[23]=208;b[24]=45;b[25]=10;b[26]=76;b[27]=243;b[28]=223;b[29]=155;b[30]=244;b[31]=221;
        return Address.fromUint8Array(b);
    }

    private _staking(): Address {
        const b = new Uint8Array(32);
        b[0]=46;b[1]=149;b[2]=91;b[3]=66;b[4]=230;b[5]=255;b[6]=9;b[7]=52;b[8]=204;b[9]=179;b[10]=212;b[11]=241;b[12]=186;b[13]=77;b[14]=14;b[15]=33;b[16]=155;b[17]=162;b[18]=40;b[19]=49;b[20]=223;b[21]=188;b[22]=171;b[23]=227;b[24]=255;b[25]=94;b[26]=24;b[27]=91;b[28]=223;b[29]=148;b[30]=42;b[31]=94;
        return Address.fromUint8Array(b);
    }

    private _dev(): Address {
        const b = new Uint8Array(32);
        b[0]=120;b[1]=108;b[2]=169;b[3]=131;b[4]=216;b[5]=89;b[6]=125;b[7]=175;b[8]=129;b[9]=177;b[10]=143;b[11]=142;b[12]=219;b[13]=14;b[14]=36;b[15]=184;b[16]=40;b[17]=125;b[18]=35;b[19]=144;b[20]=211;b[21]=145;b[22]=45;b[23]=119;b[24]=107;b[25]=78;b[26]=79;b[27]=181;b[28]=87;b[29]=106;b[30]=214;b[31]=2;
        return Address.fromUint8Array(b);
    }
}
