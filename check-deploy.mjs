import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });
const block = await provider.getBlockNumber();
console.log('Current block:', block);
try {
    const code = await provider.getCode('opt1sqpdsfg3zvjl42u67yhn3g06tx78ka5neagv9e78d');
    const hasCode = code && code.length > 0;
    console.log('Contract bytecode:', hasCode ? 'CONFIRMED (' + code.length + ' bytes)' : 'not yet');
} catch(e) {
    console.log('getCode error:', e.message);
}
try {
    const receipt = await provider.getTransactionReceipt('5add323296232e730df9e6268915d2d0574ce280e86b93e47d9ba0054b529d92');
    console.log('Deploy TX block:', receipt?.blockNumber?.toString() || 'pending');
} catch(e) { console.log('Receipt check:', e.message); }
await provider.close();
