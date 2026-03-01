# KingDick - Testnet Addresses & Resources

## Network

| Key | Value |
|-----|-------|
| Network | OPNet Testnet (Signet fork) |
| RPC URL | `https://testnet.opnet.org` |
| Explorer | `https://testnet.opnet.org/tx/` |
| Faucet | `https://signetfaucet.com` (Signet BTC for gas) |

## Contract Addresses

| Contract | Address |
|----------|---------|
| KingDick | `opt1sqz52ykz8mzmxn8x0a4naf44uztdys2y4m5dzdeh2` |
| MOTO Token | `opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds` |
| Staking | `831ca1f8ebcc1925be9aa3a22fd3c5c4bf7d03a86c66c39194fef698acb886ae` |
| Dev Fee | `786ca983d8597daf81b18f8edb0e24b8287d2390d3912d776b4e4fb5576ad602` |

## Game Parameters

| Parameter | Value |
|-----------|-------|
| Ticket Price | 50 MOTO |
| Decimals | 18 |
| Snapshot Offset | 135 blocks |
| Winner Share | 85% |
| Staking Share | 10% |
| Dev Share | ~3% |
| Settler Fee | 0.2% |

## Wallet

| Key | Value |
|-----|-------|
| Wallet | OP_WALLET (official OPNet wallet) |
| Install | [Chrome Web Store](https://chromewebstore.google.com/search/OP_WALLET) |
| Integration | `@btc-vision/opwallet` |
| Network Setting | Must select **OPNet Testnet** in OP_WALLET |

## Frontend Config

```typescript
import { networks } from '@btc-vision/bitcoin';

export const CONTRACT_ADDRESS = 'opt1sqz52ykz8mzmxn8x0a4naf44uztdys2y4m5dzdeh2';
export const RPC_URL = 'https://testnet.opnet.org';
export const MOTO_ADDRESS = 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds';
export const NETWORK = networks.opnetTestnet;
```
