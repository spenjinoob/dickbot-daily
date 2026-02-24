import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    OP_NET,
    Revert,
    SafeMath,
    StoredBoolean,
    StoredMapU256,
    StoredU256,
    encodeSelector,
    Selector,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';

const SNAPSHOT_OFFSET: u64 = 135;

// Storage pointers — fixed at compile time
const PTR_CYCLE_ID:      u16 = 1;
const PTR_CYCLE_START:   u16 = 2;
const PTR_TOTAL_TICKETS: u16 = 3;
const PTR_TOTAL_POT:     u16 = 4;
const PTR_SETTLED:       u16 = 5;
const PTR_KING_ADDR:     u16 = 6;
const PTR_KING_STREAK:   u16 = 7;
const PTR_LAST_WINNER:   u16 = 8;
const PTR_LAST_POT:      u16 = 9;
const PTR_TICKETS_MAP:   u16 = 10;
const PTR_ROLLOVER_MAP:  u16 = 11;

@final
export class KingDick extends OP_NET {

    private readonly buyTicketsSelector:    Selector = encodeSelector('buyTickets(uint256)');
    private readonly settleSelector:        Selector = encodeSelector('settle(address,uint256)');
    private readonly getStateSelector:      Selector = encodeSelector('getState()');
    private readonly getMyTicketsSelector:  Selector = encodeSelector('getMyTickets(address)');

    // ── Lazy-loaded storage — only initialized on first access ────────────────
    private _cycleId:      StoredU256    | null = null;
    private _cycleStart:   StoredU256    | null = null;
    private _totalTickets: StoredU256    | null = null;
    private _totalPot:     StoredU256    | null = null;
    private _settled:      StoredBoolean | null = null;
    private _kingAddr:     StoredU256    | null = null;
    private _kingStreak:   StoredU256    | null = null;
    private _lastWinner:   StoredU256    | null = null;
    private _lastPot:      StoredU256    | null = null;
    private _ticketsMap:   StoredMapU256 | null = null;
    private _rolloverMap:  StoredMapU256 | null = null;

    private get cycleId():      StoredU256    { if (!this._cycleId)      this._cycleId      = new StoredU256(PTR_CYCLE_ID,      EMPTY_POINTER); return this._cycleId!; }
    private get cycleStart():   StoredU256    { if (!this._cycleStart)   this._cycleStart   = new StoredU256(PTR_CYCLE_START,   EMPTY_POINTER); return this._cycleStart!; }
    private get totalTickets(): StoredU256    { if (!this._totalTickets) this._totalTickets = new StoredU256(PTR_TOTAL_TICKETS, EMPTY_POINTER); return this._totalTickets!; }
    private get totalPot():     StoredU256    { if (!this._totalPot)     this._totalPot     = new StoredU256(PTR_TOTAL_POT,     EMPTY_POINTER); return this._totalPot!; }
    private get settled():      StoredBoolean { if (!this._settled)      this._settled      = new StoredBoolean(PTR_SETTLED,    false);         return this._settled!; }
    private get kingAddr():     StoredU256    { if (!this._kingAddr)     this._kingAddr     = new StoredU256(PTR_KING_ADDR,     EMPTY_POINTER); return this._kingAddr!; }
    private get kingStreak():   StoredU256    { if (!this._kingStreak)   this._kingStreak   = new StoredU256(PTR_KING_STREAK,   EMPTY_POINTER); return this._kingStreak!; }
    private get lastWinner():   StoredU256    { if (!this._lastWinner)   this._lastWinner   = new StoredU256(PTR_LAST_WINNER,   EMPTY_POINTER); return this._lastWinner!; }
    private get lastPot():      StoredU256    { if (!this._lastPot)      this._lastPot      = new StoredU256(PTR_LAST_POT,      EMPTY_POINTER); return this._lastPot!; }
    private get ticketsMap():   StoredMapU256 { if (!this._ticketsMap)   this._ticketsMap   = new StoredMapU256(PTR_TICKETS_MAP);               return this._ticketsMap!; }
    private get rolloverMap():  StoredMapU256 { if (!this._rolloverMap)  this._rolloverMap  = new StoredMapU256(PTR_ROLLOVER_MAP);              return this._rolloverMap!; }

    // ── Minimal constructor — no storage initialization ────────────────────────
    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {}

    public callMethod(calldata: Calldata): BytesWriter {
        const selector: Selector = calldata.readSelector();
        switch (selector) {
            case this.buyTicketsSelector:   return this.buyTickets(calldata);
            case this.settleSelector:       return this.settle(calldata);
            case this.getStateSelector:     return this.getState(calldata);
            case this.getMyTicketsSelector: return this.getMyTickets(calldata);
            default:                        return super.callMethod(calldata);
        }
    }

    public buyTickets(calldata: Calldata): BytesWriter {
        const count = calldata.readU256();
        if (u256.le(count, u256.Zero)) throw new Revert('Count > 0');

        if (u256.eq(this.cycleId.value, u256.Zero)) {
            this.cycleId.value    = u256.fromU64(1);
            this.cycleStart.value = Blockchain.block.numberU256;
        }

        const buyer          = Blockchain.tx.sender;
        const snapshotBlock: u64 = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        const totalCost      = SafeMath.mul(count, u256.fromU64(5000000000));

        TransferHelper.transferFrom(this._moto(), buyer, Blockchain.contractAddress, totalCost);

        const cycleKey = this._key(this.cycleId.value, buyer);

        if (Blockchain.block.number < snapshotBlock) {
            this.ticketsMap.set(cycleKey, SafeMath.add(this.ticketsMap.get(cycleKey), count));
            this.totalTickets.value = SafeMath.add(this.totalTickets.value, count);
            this.totalPot.value     = SafeMath.add(this.totalPot.value, totalCost);
        } else {
            const wk = this._wkey(buyer);
            this.rolloverMap.set(wk, SafeMath.add(this.rolloverMap.get(wk), count));
        }

        const w = new BytesWriter(32);
        w.writeU256(this.ticketsMap.get(cycleKey));
        return w;
    }

    public settle(calldata: Calldata): BytesWriter {
        const claimedWinner      = calldata.readAddress();
        const claimedTicketIndex = calldata.readU256();

        if (u256.eq(this.cycleId.value, u256.Zero)) throw new Revert('No cycle');

        const snapshotBlock: u64 = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        if (Blockchain.block.number < snapshotBlock) throw new Revert('Too early');
        if (this.settled.value)                      throw new Revert('Settled');

        const totalTickets = this.totalTickets.value;
        if (u256.eq(totalTickets, u256.Zero)) {
            this._advance();
            const w = new BytesWriter(32);
            w.writeAddress(Address.zero());
            return w;
        }

        if (u256.ge(claimedTicketIndex, totalTickets)) throw new Revert('Bad index');

        const winningTicket = this._hashMod(Blockchain.getBlockHash(snapshotBlock), totalTickets);
        if (!u256.eq(winningTicket, claimedTicketIndex)) throw new Revert('Wrong index');
        if (u256.eq(this.ticketsMap.get(this._key(this.cycleId.value, claimedWinner)), u256.Zero)) throw new Revert('No tickets');

        const totalPot   = this.totalPot.value;
        const settlerAmt = SafeMath.div(SafeMath.mul(totalPot, u256.fromU64(2)),   u256.fromU64(1000));
        const remainder  = SafeMath.sub(totalPot, settlerAmt);
        const winnerAmt  = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(850)), u256.fromU64(1000));
        const stakingAmt = SafeMath.div(SafeMath.mul(remainder, u256.fromU64(100)), u256.fromU64(1000));
        const devAmt     = SafeMath.sub(SafeMath.sub(remainder, winnerAmt), stakingAmt);

        const caller = Blockchain.tx.sender;

        this.settled.value    = true;
        this.lastWinner.value = this._addrToU256(claimedWinner);
        this.lastPot.value    = totalPot;

        const prevKing = this._u256ToAddr(this.kingAddr.value);
        this.kingAddr.value   = this._addrToU256(claimedWinner);
        this.kingStreak.value = claimedWinner.equals(prevKing)
            ? SafeMath.inc(this.kingStreak.value)
            : u256.fromU64(1);

        TransferHelper.transfer(this._moto(), caller, settlerAmt);
        TransferHelper.transfer(this._moto(), claimedWinner, winnerAmt);
        TransferHelper.transfer(this._moto(), this._staking(), stakingAmt);
        TransferHelper.transfer(this._moto(), this._dev(), devAmt);

        this._advance();
        const w = new BytesWriter(32);
        w.writeAddress(claimedWinner);
        return w;
    }

    public getState(_calldata: Calldata): BytesWriter {
        const snap = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        const w = new BytesWriter(353);
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
        return w;
    }

    public getMyTickets(calldata: Calldata): BytesWriter {
        const wallet = calldata.readAddress();
        const w = new BytesWriter(64);
        w.writeU256(this.ticketsMap.get(this._key(this.cycleId.value, wallet)));
        w.writeU256(this.rolloverMap.get(this._wkey(wallet)));
        return w;
    }

    private _advance(): void {
        this.cycleId.value      = SafeMath.inc(this.cycleId.value);
        this.cycleStart.value   = Blockchain.block.numberU256;
        this.settled.value      = false;
        this.totalTickets.value = u256.Zero;
        this.totalPot.value     = u256.Zero;
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
        b[0]=131;b[1]=28;b[2]=161;b[3]=248;b[4]=235;b[5]=204;b[6]=25;b[7]=37;b[8]=190;b[9]=154;b[10]=163;b[11]=162;b[12]=47;b[13]=211;b[14]=197;b[15]=196;b[16]=191;b[17]=125;b[18]=3;b[19]=168;b[20]=108;b[21]=102;b[22]=195;b[23]=145;b[24]=148;b[25]=254;b[26]=246;b[27]=152;b[28]=172;b[29]=184;b[30]=134;b[31]=174;
        return Address.fromUint8Array(b);
    }

    private _dev(): Address {
        const b = new Uint8Array(32);
        b[0]=120;b[1]=108;b[2]=169;b[3]=131;b[4]=216;b[5]=89;b[6]=125;b[7]=175;b[8]=129;b[9]=177;b[10]=143;b[11]=142;b[12]=219;b[13]=14;b[14]=36;b[15]=184;b[16]=40;b[17]=125;b[18]=35;b[19]=144;b[20]=211;b[21]=145;b[22]=45;b[23]=119;b[24]=107;b[25]=78;b[26]=79;b[27]=181;b[28]=87;b[29]=106;b[30]=214;b[31]=2;
        return Address.fromUint8Array(b);
    }
}
