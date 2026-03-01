import { Mnemonic, TransactionFactory } from '@btc-vision/transaction';
import { networks, toHex } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';
import fs from 'fs';

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
    console.error('Usage: MNEMONIC="your 12/24 words" node deploy.mjs');
    process.exit(1);
}

const network = networks.opnetTestnet;
const rpcUrl = 'https://testnet.opnet.org';

const provider = new JSONRpcProvider({ url: rpcUrl, network });
const mnemonic = new Mnemonic(MNEMONIC, '', network);
const wallet = mnemonic.deriveOPWallet();

console.log('Network: OPNet Testnet');
console.log('Deployer address:', wallet.p2tr);

const bytecode = new Uint8Array(fs.readFileSync('./build/KingDick.wasm'));
console.log('Bytecode size:', bytecode.length, 'bytes');

console.log('Fetching UTXOs...');
const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

if (!utxos.length) {
    console.error('No UTXOs available. Fund this address first:', wallet.p2tr);
    mnemonic.zeroize();
    wallet.zeroize();
    await provider.close();
    process.exit(1);
}
console.log('Found', utxos.length, 'UTXOs');

console.log('Fetching challenge...');
const challenge = await provider.getChallenge();

console.log('Signing deployment...');
const factory = new TransactionFactory();
const result = await factory.signDeployment({
    from: wallet.p2tr,
    utxos: utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network,
    feeRate: 10,
    priorityFee: 10_000n,
    gasSatFee: 100_000n,
    bytecode,
    challenge,
    randomBytes: crypto.getRandomValues(new Uint8Array(32)),
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
});

console.log('Contract address (bech32):', result.contractAddress);
console.log('Contract pubkey (base64):', result.contractPubKey);

// Decode base64 pubkey to hex without Buffer
const raw = Uint8Array.from(atob(result.contractPubKey), c => c.charCodeAt(0));
const pubkeyHex = Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join('');
console.log('Contract pubkey (hex):', pubkeyHex);

console.log('\nBroadcasting funding TX...');
const fundingResult = await provider.sendRawTransaction(result.transaction[0], false);
console.log('Funding TX result:', JSON.stringify(fundingResult));

if (!fundingResult.success) {
    console.error('Funding TX failed! Aborting.');
    mnemonic.zeroize();
    wallet.zeroize();
    await provider.close();
    process.exit(1);
}

console.log('Waiting 5s for propagation...');
await new Promise(r => setTimeout(r, 5000));

console.log('Broadcasting deployment TX...');
const revealResult = await provider.sendRawTransaction(result.transaction[1], false);
console.log('Deployment TX result:', JSON.stringify(revealResult));

console.log('\n=== DEPLOYMENT COMPLETE ===');
console.log('Contract address (bech32):', result.contractAddress);
console.log('Contract pubkey (hex):', pubkeyHex);
console.log('\nUpdate frontend/src/config.ts with:');
console.log(`export const CONTRACT_ADDRESS = '${result.contractAddress}';`);

mnemonic.zeroize();
wallet.zeroize();
await provider.close();
