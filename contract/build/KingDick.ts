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

@final
export class KingDick extends OP_NET {

    private readonly buyTicketsSelector:   Selector = encodeSelector('buyTickets(uint256)');
    private readonly settleSelector:       Selector = encodeSelector('settle(address,uint256)');
    private readonly getStateSelector:     Selector = encodeSelector('getState()');
    private readonly getMyTicketsSelector: Selector = encodeSelector('getMyTickets(address)');

    private readonly cycleIdPtr:      u16 = Blockchain.nextPointer;
    private readonly cycleStartPtr:   u16 = Blockchain.nextPointer;
    private readonly totalTicketsPtr: u16 = Blockchain.nextPointer;
    private readonly totalPotPtr:     u16 = Blockchain.nextPointer;
    private readonly settledPtr:      u16 = Blockchain.nextPointer;
    private readonly kingAddrPtr:     u16 = Blockchain.nextPointer;
    private readonly kingStreakPtr:   u16 = Blockchain.nextPointer;
    private readonly lastWinnerPtr:   u16 = Blockchain.nextPointer;
    private readonly lastPotPtr:      u16 = Blockchain.nextPointer;
    private readonly ticketsMapPtr:   u16 = Blockchain.nextPointer;
    private readonly rolloverMapPtr:  u16 = Blockchain.nextPointer;

    private cycleId:      StoredU256    = new StoredU256(this.cycleIdPtr,      EMPTY_POINTER);
    private cycleStart:   StoredU256    = new StoredU256(this.cycleStartPtr,   EMPTY_POINTER);
    private totalTickets: StoredU256    = new StoredU256(this.totalTicketsPtr, EMPTY_POINTER);
    private totalPot:     StoredU256    = new StoredU256(this.totalPotPtr,     EMPTY_POINTER);
    private settled:      StoredBoolean = new StoredBoolean(this.settledPtr,   false);
    private kingAddr:     StoredU256    = new StoredU256(this.kingAddrPtr,     EMPTY_POINTER);
    private kingStreak:   StoredU256    = new StoredU256(this.kingStreakPtr,   EMPTY_POINTER);
    private lastWinner:   StoredU256    = new StoredU256(this.lastWinnerPtr,   EMPTY_POINTER);
    private lastPot:      StoredU256    = new StoredU256(this.lastPotPtr,      EMPTY_POINTER);
    private ticketsMap:   StoredMapU256 = new StoredMapU256(this.ticketsMapPtr);
    private rolloverMap:  StoredMapU256 = new StoredMapU256(this.rolloverMapPtr);

    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {}

    public callMethod(calldata: Calldata): BytesWriter {
        const selector: Selector = calldata.readSelector();
        switch (selector) {
            case this.buyTicketsSelector:  return this.buyTickets(calldata);
            case this.settleSelector:      return this.settle(calldata);
            case this.getStateSelector:    return this.getState(calldata);
            case this.getMyTicketsSelector: return this.getMyTickets(calldata);
            default:                       return super.callMethod(calldata);
        }
    }

    public buyTickets(calldata: Calldata): BytesWriter {
        const count = calldata.readU256();
        if (u256.le(count, u256.Zero)) throw new Revert('Count > 0');

        if (u256.eq(this.cycleId.value, u256.Zero)) {
            this.cycleId.value    = u256.fromU64(1);
            this.cycleStart.value = Blockchain.block.numberU256;
        }

        const buyer         = Blockchain.tx.sender;
        const snapshotBlock: u64 = this.cycleStart.value.toU64() + SNAPSHOT_OFFSET;
        const totalCost     = SafeMath.mul(count, u256.fromString('50000000000000000000'));

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

    // Hardcoded MOTO address bytes (fd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd)
    private _moto(): Address {
        const b = new Uint8Array(32);
        b[0]=253;b[1]=68;b[2]=115;b[3]=132;b[4]=7;b[5]=81;b[6]=213;b[7]=141;
        b[8]=159;b[9]=139;b[10]=115;b[11]=189;b[12]=213;b[13]=125;b[14]=108;b[15]=82;
        b[16]=96;b[17]=69;b[18]=61;b[19]=85;b[20]=24;b[21]=189;b[22]=124;b[23]=208;
        b[24]=45;b[25]=10;b[26]=76;b[27]=243;b[28]=223;b[29]=155;b[30]=244;b[31]=221;
        return Address.fromUint8Array(b);
    }

    // Staking address bytes
    private _staking(): Address {
        const b = new Uint8Array(32);
        b[0]=46;b[1]=149;b[2]=91;b[3]=66;b[4]=230;b[5]=255;b[6]=9;b[7]=52;
        b[8]=203;b[9]=179;b[10]=212;b[11]=241;b[12]=186;b[13]=77;b[14]=14;b[15]=33;
        b[16]=155;b[17]=162;b[18]=40;b[19]=49;b[20]=223;b[21]=188;b[22]=171;b[23]=227;
        b[24]=255;b[25]=94;b[26]=24;b[27]=91;b[28]=223;b[29]=148;b[30]=42;b[31]=94;
        return Address.fromUint8Array(b);
    }

    // Dev wallet bytes
    private _dev(): Address {
        const b = new Uint8Array(32);
        b[0]=114;b[1]=36;b[2]=11;b[3]=240;b[4]=42;b[5]=195;b[6]=239;b[7]=214;
        b[8]=204;b[9]=226;b[10]=213;b[11]=185;b[12]=242;b[13]=210;b[14]=150;b[15]=168;
        b[16]=72;b[17]=23;b[18]=54;b[19]=230;b[20]=172;b[21]=233;b[22]=247;b[23]=158;
        b[24]=89;b[25]=3;b[26]=73;b[27]=19;b[28]=1;b[29]=0;b[30]=149;b[31]=212;
        return Address.fromUint8Array(b);
    }
}
