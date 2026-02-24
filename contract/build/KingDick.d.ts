/** Exported memory */
export declare const memory: WebAssembly.Memory;
/**
 * src/index/abort
 * @param message `~lib/string/String`
 * @param fileName `~lib/string/String`
 * @param line `u32`
 * @param column `u32`
 */
export declare function abort(message: string, fileName: string, line: number, column: number): void;
/**
 * ~lib/@btc-vision/btc-runtime/runtime/exports/index/execute
 * @param calldataLength `u32`
 * @returns `u32`
 */
export declare function execute(calldataLength: number): number;
/**
 * ~lib/@btc-vision/btc-runtime/runtime/exports/index/onDeploy
 * @param calldataLength `u32`
 * @returns `u32`
 */
export declare function onDeploy(calldataLength: number): number;
/**
 * ~lib/@btc-vision/btc-runtime/runtime/exports/index/onUpdate
 * @param calldataLength `u32`
 * @returns `u32`
 */
export declare function onUpdate(calldataLength: number): number;
