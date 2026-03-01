import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { KingDick } from './KingDick';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

Blockchain.contract = (): KingDick => {
    return new KingDick();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
