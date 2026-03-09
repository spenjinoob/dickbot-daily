/**
 * KingDick Contract Deployment Script
 * Deploys the compiled WASM to OPNet testnet.
 */
import { Mnemonic, TransactionFactory } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';
import fs from 'fs';

const WALLET_FILE = '/home/vibecode/motocatroulette1.1/.test-wallets.json';
const WASM_PATH   = '/home/vibecode/Kingdick/contract/build/KingDick.wasm';

const wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });
const mnemonic = new Mnemonic(wallets[0].phrase, '', network);
const wallet = mnemonic.deriveOPWallet();

console.log('=== KingDick Deployment ===');
console.log('Wallet:', wallet.p2tr);
console.log('Network: OPNet Testnet');
console.log('');

// Read WASM bytecode
const wasmBytes = fs.readFileSync(WASM_PATH);
console.log('WASM size:', wasmBytes.length, 'bytes');

// Get UTXOs
const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr, optimize: false });
console.log('UTXOs available:', utxos.length);

if (utxos.length === 0) {
    console.error('FATAL: No UTXOs available for deployment. Fund the wallet first.');
    await provider.close();
    process.exit(1);
}

// Use top 5 UTXOs by value
const sortedUtxos = [...utxos].sort((a, b) => Number(b.value - a.value));
const limitedUtxos = sortedUtxos.slice(0, 5);
console.log('Using top', limitedUtxos.length, 'UTXOs, total:', limitedUtxos.reduce((s, u) => s + u.value, 0n).toString(), 'sat');

// Get challenge
console.log('\nFetching challenge...');
const challenge = await provider.getChallenge();
console.log('Challenge:', challenge ? 'obtained' : 'NONE');

// Deploy
console.log('Signing deployment...');
const factory = new TransactionFactory();

const result = await factory.signDeployment({
    network,
    bytecode: wasmBytes,
    utxos: limitedUtxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    from: wallet.p2tr,
    feeRate: 50,
    priorityFee: 10_000n,
    gasSatFee: 50_000n,
    challenge,
});

const [fundingHex, deployHex] = result.transaction;
console.log('Funding TX size:', fundingHex.length / 2, 'bytes');
console.log('Deploy TX size:', deployHex.length / 2, 'bytes');
console.log('Contract address:', result.contractAddress);

// Broadcast funding TX
console.log('\nBroadcasting funding TX...');
const fundResult = await provider.sendRawTransaction(fundingHex, false);
console.log('Funding result:', JSON.stringify(fundResult));

if (!fundResult.success) {
    console.error('FATAL: Funding TX failed:', fundResult.error);
    await provider.close();
    process.exit(1);
}

// Wait for propagation
console.log('Waiting 5s for propagation...');
await new Promise(r => setTimeout(r, 5000));

// Broadcast deploy TX
console.log('Broadcasting deploy TX...');
const deployResult = await provider.sendRawTransaction(deployHex, false);
console.log('Deploy result:', JSON.stringify(deployResult));

if (!deployResult.success) {
    console.error('FATAL: Deploy TX failed:', deployResult.error);
    await provider.close();
    process.exit(1);
}

console.log('\n=== DEPLOYMENT SUBMITTED ===');
console.log('Contract address:', result.contractAddress);
console.log('Funding TX:', fundResult.result);
console.log('Deploy TX:', deployResult.result);
console.log('\nWait for a Signet block (~10 min) for confirmation.');
console.log('Then update frontend/src/config.ts with the new contract address.');

await provider.close();
