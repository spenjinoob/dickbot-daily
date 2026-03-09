import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

console.log('Current block:', await provider.getBlockNumber());

// Check funding TX
try {
    const receipt = await provider.getTransactionReceipt('56646f360a5f8f4ce16520522fcd9b8c0f75a3bfd68de5ca26427c8eeb2a9a47');
    console.log('Funding TX block:', receipt?.blockNumber?.toString() || 'pending');
    console.log('Funding TX status:', receipt?.status);
} catch(e) { console.log('Funding TX error:', e.message); }

// Check deploy TX
try {
    const receipt = await provider.getTransactionReceipt('de233f95982767edfdaea7ad7c973314d4a5116629ebf937b3acb858b8365098');
    console.log('Deploy TX block:', receipt?.blockNumber?.toString() || 'pending');
    console.log('Deploy TX status:', receipt?.status);
} catch(e) { console.log('Deploy TX error:', e.message); }

// Check code
try {
    const code = await provider.getCode('opt1sqq0rwtt5a0s8awe4exu0m4skm3934d70r5d5l9ve');
    console.log('Contract code:', code && code.length > 0 ? 'DEPLOYED (' + code.length + ' bytes)' : 'none');
} catch(e) { console.log('getCode error:', e.message); }

await provider.close();
