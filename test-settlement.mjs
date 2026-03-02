/**
 * KingDick Settlement E2E Test
 *
 * Tests the full cycle: buy tickets → wait for snapshot → settle → verify fee distribution.
 * Uses the 5-block snapshot offset contract at opt1sqpdsfg3zvjl42u67yhn3g06tx78ka5neagv9e78d.
 *
 * Verifies that the pot splits correctly:
 *   - Settler:  0.2% of totalPot
 *   - Winner:  85% of remainder (= 84.83% of totalPot)
 *   - Staking: 10% of remainder (= 9.98% of totalPot)
 *   - Dev:      remainder leftover (= 4.99% of totalPot)
 */
import { Mnemonic, Address } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI, OP_20_ABI } from 'opnet';
import fs from 'fs';

// ── Config ─────────────────────────────────────────────────────────────────────

const WALLET_FILE = '/home/vibecode/motocatroulette1.1/.test-wallets.json';
const CONTRACT    = 'opt1sqpdsfg3zvjl42u67yhn3g06tx78ka5neagv9e78d';
const MOTO        = 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds';
const TICKET_COUNT = 2n;           // Buy 2 tickets = 100 MOTO
const TICKET_PRICE = 50n * 10n ** 18n;  // 50 MOTO in wei
const POLL_MS      = 15_000;       // Poll every 15s for block progress

// Hardcoded addresses from the contract (byte arrays → hex)
// These are the internal OPNet addresses the contract transfers fees to
const STAKING_HEX = '0x831ca1f8ebcc1925be9aa3a22fd3c5c4bf7d03a86c66c39194fef698acb886ae';
const DEV_HEX     = '0x786ca983d8597daf81b18f8edb0e24b8287d2390d3912d776b4e4fb5576ad602';

// ── ABI ────────────────────────────────────────────────────────────────────────

const KingDickAbi = [
    { name: 'buyTickets', inputs: [{ name: 'count', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'ticketsThisCycle', type: ABIDataTypes.UINT256 }], type: BitcoinAbiTypes.Function },
    { name: 'settle', inputs: [{ name: 'purchaseIndex', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'winner', type: ABIDataTypes.ADDRESS }], type: BitcoinAbiTypes.Function },
    { name: 'getState', inputs: [], outputs: [
        { name: 'cycleId', type: ABIDataTypes.UINT256 }, { name: 'totalTickets', type: ABIDataTypes.UINT256 },
        { name: 'totalPot', type: ABIDataTypes.UINT256 }, { name: 'snapshotBlock', type: ABIDataTypes.UINT256 },
        { name: 'currentBlock', type: ABIDataTypes.UINT256 }, { name: 'kingAddress', type: ABIDataTypes.ADDRESS },
        { name: 'kingStreak', type: ABIDataTypes.UINT256 }, { name: 'lastWinner', type: ABIDataTypes.ADDRESS },
        { name: 'lastPot', type: ABIDataTypes.UINT256 }, { name: 'settled', type: ABIDataTypes.BOOL },
        { name: 'purchaseCount', type: ABIDataTypes.UINT256 },
    ], type: BitcoinAbiTypes.Function },
    ...OP_NET_ABI,
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtMoto = (wei) => (Number(wei) / 1e18).toFixed(4);
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

function hexToAddress(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return Address.wrap(bytes);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         KINGDICK SETTLEMENT E2E TEST                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Setup
    const wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    const network = networks.opnetTestnet;
    const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
    const mnemonic = new Mnemonic(wallets[0].phrase, '', network);
    const wallet = mnemonic.deriveOPWallet();

    const stakingAddr = hexToAddress(STAKING_HEX);
    const devAddr     = hexToAddress(DEV_HEX);

    log(`Wallet:   ${wallet.p2tr}`);
    log(`Wallet internal: ${wallet.address.toHex()}`);
    log(`Contract: ${CONTRACT}`);
    log(`MOTO:     ${MOTO}`);
    console.log('');

    // Resolve contract's internal address for allowance check
    const contractAddr = await provider.getPublicKeyInfo(CONTRACT, true);
    log(`KingDick internal addr: 0x${[...contractAddr].map(b => b.toString(16).padStart(2, '0')).join('')}`);

    // ── Step 1: Check pre-settlement MOTO balances ─────────────────────────────

    console.log('\n── STEP 1: Pre-settlement balances ──────────────────────────');
    const moto = getContract(MOTO, OP_20_ABI, provider, network, wallet.address);

    async function getBalance(addr, label) {
        try {
            const res = await moto.balanceOf(addr);
            if ('error' in res) { log(`  ${label}: ERROR - ${res.error}`); return 0n; }
            const bal = res.properties.balance;
            log(`  ${label}: ${fmtMoto(bal)} MOTO (${bal} wei)`);
            return bal;
        } catch (e) {
            log(`  ${label}: EXCEPTION - ${e.message?.slice(0, 100)}`);
            return 0n;
        }
    }

    const preWallet  = await getBalance(wallet.address, 'Wallet ');
    const preStaking = await getBalance(stakingAddr,     'Staking');
    const preDev     = await getBalance(devAddr,         'Dev    ');

    // ── Step 2: Check/set allowance ────────────────────────────────────────────

    console.log('\n── STEP 2: Allowance check ──────────────────────────────────');
    const totalCost = TICKET_COUNT * TICKET_PRICE;
    log(`Need allowance for: ${fmtMoto(totalCost)} MOTO`);

    let currentAllowance = 0n;
    try {
        const allowRes = await moto.allowance(wallet.address, contractAddr);
        if (!('error' in allowRes)) {
            const raw = allowRes.properties.remaining;
            currentAllowance = typeof raw === 'bigint' ? raw : BigInt(raw?.toString() ?? '0');
        }
    } catch { /* ignore */ }
    log(`Current allowance: ${fmtMoto(currentAllowance)} MOTO`);

    if (currentAllowance < totalCost) {
        const increaseBy = totalCost * 100n; // Approve plenty
        log(`Increasing allowance by ${fmtMoto(increaseBy)} MOTO...`);
        const approveSim = await moto.increaseAllowance(contractAddr, increaseBy);
        if ('error' in approveSim) {
            console.error('FATAL: increaseAllowance failed:', approveSim.error);
            await provider.close();
            process.exit(1);
        }

        const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
        const approveTx = await approveSim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            utxos,
            maximumAllowedSatToSpend: 100_000n,
            feeRate: 10,
            network,
        });
        log(`Allowance TX: ${approveTx?.transactionId ?? 'N/A'}`);
        log('Waiting for allowance to confirm (polling every 30s, may take a Signet block ~10min)...');

        let confirmed = false;
        for (let attempt = 0; attempt < 40; attempt++) {
            await sleep(30_000);
            try {
                const freshMoto = getContract(MOTO, OP_20_ABI, provider, network, wallet.address);
                const checkRes = await freshMoto.allowance(wallet.address, contractAddr);
                if (!('error' in checkRes)) {
                    const nowAllowance = typeof checkRes.properties.remaining === 'bigint'
                        ? checkRes.properties.remaining
                        : BigInt(checkRes.properties.remaining?.toString() ?? '0');
                    log(`  Allowance now: ${fmtMoto(nowAllowance)} MOTO`);
                    if (nowAllowance >= totalCost) {
                        confirmed = true;
                        break;
                    }
                }
            } catch { /* keep polling */ }
            log(`  Still waiting... (attempt ${attempt + 1})`);
        }

        if (!confirmed) {
            console.error('FATAL: Allowance did not confirm after 20 min.');
            await provider.close();
            process.exit(1);
        }
        log('Allowance confirmed!');
    } else {
        log('Allowance sufficient, skipping.');
    }

    // ── Step 3: Get state before buying ────────────────────────────────────────

    console.log('\n── STEP 3: Get contract state ───────────────────────────────');
    const kd = getContract(CONTRACT, KingDickAbi, provider, network, wallet.address);
    const statePre = await kd.getState();
    if ('error' in statePre) { console.error('getState error:', statePre.error); await provider.close(); process.exit(1); }
    const sp = statePre.properties;
    log(`Cycle: ${sp.cycleId} | Tickets: ${sp.totalTickets} | Pot: ${fmtMoto(sp.totalPot)} MOTO`);
    log(`Snapshot: ${sp.snapshotBlock} | Current: ${sp.currentBlock} | Settled: ${sp.settled}`);

    // ── Step 4: Buy tickets ────────────────────────────────────────────────────

    console.log('\n── STEP 4: Buy tickets ─────────────────────────────────────');
    log(`Buying ${TICKET_COUNT} tickets (${fmtMoto(totalCost)} MOTO)...`);

    const buySim = await kd.buyTickets(TICKET_COUNT);
    if ('error' in buySim) {
        console.error('FATAL: buyTickets simulation failed:', buySim.error);
        await provider.close();
        process.exit(1);
    }
    log(`Simulation OK. Tickets this cycle: ${buySim.properties.ticketsThisCycle}`);

    const utxos2 = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
    const buyTx = await buySim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        utxos: utxos2,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network,
    });
    log(`Buy TX: ${buyTx?.transactionId ?? 'N/A'}`);
    log('Waiting for buy TX to confirm (polling for state change)...');

    let buyConfirmed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(30_000);
        try {
            const checkState = await kd.getState();
            if (!('error' in checkState) && Number(checkState.properties.totalTickets) > 0) {
                log(`  Buy confirmed! Tickets: ${checkState.properties.totalTickets}`);
                buyConfirmed = true;
                break;
            }
        } catch { /* keep polling */ }
        log(`  Still waiting for buy confirmation... (attempt ${attempt + 1})`);
    }

    if (!buyConfirmed) {
        console.error('FATAL: Buy TX did not confirm after 20 min.');
        await provider.close();
        process.exit(1);
    }

    // ── Step 5: Poll until snapshot window passes ──────────────────────────────

    console.log('\n── STEP 5: Waiting for snapshot window ─────────────────────');
    let ready = false;
    let stateNow;
    while (!ready) {
        const s = await kd.getState();
        if ('error' in s) { log('getState error, retrying...'); await sleep(POLL_MS); continue; }
        stateNow = s.properties;
        const blocksLeft = Math.max(0, Number(stateNow.snapshotBlock) - Number(stateNow.currentBlock));
        log(`Block ${stateNow.currentBlock} | Snapshot at ${stateNow.snapshotBlock} | ${blocksLeft} blocks left | Tickets: ${stateNow.totalTickets}`);

        if (blocksLeft === 0 && Number(stateNow.totalTickets) > 0 && !stateNow.settled) {
            ready = true;
        } else {
            await sleep(POLL_MS);
        }
    }

    // ── Step 6: Settle ─────────────────────────────────────────────────────────

    console.log('\n── STEP 6: Settlement ──────────────────────────────────────');
    const purchaseCount = Number(stateNow.purchaseCount);
    log(`Searching ${purchaseCount} purchase entries for winner...`);

    let settleTx = null;
    for (let i = 0; i < purchaseCount; i++) {
        try {
            const sim = await kd.settle(BigInt(i));
            if (!('error' in sim)) {
                log(`Found winner at purchase index ${i}!`);
                log(`Winner address: ${sim.properties.winner}`);

                const utxos3 = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
                const tx = await sim.sendTransaction({
                    signer: wallet.keypair,
                    mldsaSigner: wallet.mldsaKeypair,
                    refundTo: wallet.p2tr,
                    utxos: utxos3,
                    maximumAllowedSatToSpend: 100_000n,
                    feeRate: 10,
                    network,
                });
                settleTx = tx;
                log(`Settle TX: ${tx?.transactionId ?? 'N/A'}`);
                break;
            }
        } catch (e) {
            log(`  Index ${i}: ${e.message?.slice(0, 80)}`);
        }
    }

    if (!settleTx) {
        console.error('FATAL: Could not settle. No valid purchase index found.');
        await provider.close();
        process.exit(1);
    }

    log('Waiting for settlement to confirm (polling for cycle advance)...');

    let settleConfirmed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(30_000);
        try {
            const checkState = await kd.getState();
            if (!('error' in checkState)) {
                const cs = checkState.properties;
                // Settlement advances the cycle, so cycleId should increase
                if (Number(cs.cycleId) > Number(stateNow.cycleId)) {
                    log(`  Settlement confirmed! New cycle: ${cs.cycleId}`);
                    settleConfirmed = true;
                    break;
                }
            }
        } catch { /* keep polling */ }
        log(`  Still waiting for settlement confirmation... (attempt ${attempt + 1})`);
    }

    if (!settleConfirmed) {
        console.warn('WARN: Settlement may not have confirmed yet. Checking state anyway...');
    }

    // ── Step 7: Post-settlement state ──────────────────────────────────────────

    console.log('\n── STEP 7: Post-settlement state ───────────────────────────');
    const statePost = await kd.getState();
    if ('error' in statePost) { console.error('getState error:', statePost.error); }
    else {
        const pp = statePost.properties;
        log(`Cycle: ${pp.cycleId} | Tickets: ${pp.totalTickets} | Settled: ${pp.settled}`);
        log(`Last winner: ${pp.lastWinner}`);
        log(`Last pot: ${fmtMoto(pp.lastPot)} MOTO`);
        log(`King streak: ${pp.kingStreak}`);
    }

    // ── Step 8: Post-settlement balances & verification ────────────────────────

    console.log('\n── STEP 8: Post-settlement balances & fee verification ─────');
    const postWallet  = await getBalance(wallet.address, 'Wallet ');
    const postStaking = await getBalance(stakingAddr,     'Staking');
    const postDev     = await getBalance(devAddr,         'Dev    ');

    // Calculate deltas
    const deltaWallet  = postWallet  - preWallet;
    const deltaStaking = postStaking - preStaking;
    const deltaDev     = postDev     - preDev;

    console.log('\n── FEE DISTRIBUTION ANALYSIS ────────────────────────────────');
    const totalPot = totalCost; // Expected pot = tickets * price
    log(`Total pot:        ${fmtMoto(totalPot)} MOTO`);
    console.log('');

    // Expected amounts (using contract's integer math)
    const expSettler  = (totalPot * 2n) / 1000n;
    const remainder   = totalPot - expSettler;
    const expWinner   = (remainder * 850n) / 1000n;
    const expStaking  = (remainder * 100n) / 1000n;
    const expDev      = remainder - expWinner - expStaking;

    // Since wallet is both buyer AND settler AND winner (only buyer = guaranteed winner):
    // Wallet delta = -totalCost + settlerAmt + winnerAmt
    const expWalletDelta = -totalPot + expSettler + expWinner;

    log('EXPECTED DISTRIBUTION:');
    log(`  Settler fee (0.2%):         ${fmtMoto(expSettler)} MOTO`);
    log(`  Winner (85% of remainder):  ${fmtMoto(expWinner)} MOTO`);
    log(`  Staking (10% of remainder): ${fmtMoto(expStaking)} MOTO`);
    log(`  Dev (remainder):            ${fmtMoto(expDev)} MOTO`);
    log(`  Sum check:                  ${fmtMoto(expSettler + expWinner + expStaking + expDev)} MOTO`);
    console.log('');

    log('ACTUAL DELTAS:');
    log(`  Wallet delta:  ${deltaWallet >= 0n ? '+' : ''}${fmtMoto(deltaWallet)} MOTO (expected: ${fmtMoto(expWalletDelta)})`);
    log(`  Staking delta: +${fmtMoto(deltaStaking)} MOTO (expected: +${fmtMoto(expStaking)})`);
    log(`  Dev delta:     +${fmtMoto(deltaDev)} MOTO (expected: +${fmtMoto(expDev)})`);
    console.log('');

    // Verify
    let pass = true;
    if (deltaStaking !== expStaking) {
        console.error(`  FAIL: Staking got ${fmtMoto(deltaStaking)} but expected ${fmtMoto(expStaking)}`);
        pass = false;
    } else {
        log('  PASS: Staking fee correct');
    }

    if (deltaDev !== expDev) {
        console.error(`  FAIL: Dev got ${fmtMoto(deltaDev)} but expected ${fmtMoto(expDev)}`);
        pass = false;
    } else {
        log('  PASS: Dev fee correct');
    }

    if (deltaWallet !== expWalletDelta) {
        // Could differ slightly if there were other MOTO movements
        console.warn(`  WARN: Wallet delta ${fmtMoto(deltaWallet)} vs expected ${fmtMoto(expWalletDelta)} — may differ if MOTO moved elsewhere`);
    } else {
        log('  PASS: Wallet delta correct (settler + winner - tickets)');
    }

    console.log('');
    if (pass) {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  ALL FEE PATHWAY CHECKS PASSED                              ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
    } else {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  SOME CHECKS FAILED — SEE ABOVE                             ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
    }

    await provider.close();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
