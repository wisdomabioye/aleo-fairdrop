# @fairdrop/sdk

TypeScript SDK for the Fairdrop protocol. Provides typed transaction builders, on-chain mapping reads, Leo encoding helpers, and record utilities — everything a consumer needs to interact with Fairdrop contracts without touching raw inputs.

## Table of Contents

- [Quick Start](#quick-start)
- [Entry Points](#entry-points)
- [client](#client)
- [transactions](#transactions)
- [token-registry](#token-registry)
- [credits](#credits)
- [chain](#chain)
- [hash](#hash)
- [parse](#parse)
- [format](#format)
- [records](#records)
- [multisig](#multisig)
- [constants](#constants)

---

## Quick Start

Every transaction builder returns a `TxSpec`. Spread it into your wallet adapter's `executeTransaction`:

```ts
import { buildCreateAuction } from '@fairdrop/sdk/transactions';
import { initAleoClient }     from '@fairdrop/sdk/client';

// Once at app startup
initAleoClient('https://api.explorer.provable.com/v1');

// Build the tx spec
const spec = buildCreateAuction({ type: AuctionType.Dutch, ... });

// Execute via wallet adapter
const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
```

Chain reads are plain async functions — call them anywhere:

```ts
import { fetchAuctionConfig } from '@fairdrop/sdk/chain';

const config = await fetchAuctionConfig(auctionId);
```

---

## Entry Points

| Entry point              | Purpose                                              |
|--------------------------|------------------------------------------------------|
| `@fairdrop/sdk/client`   | Initialize and access the Aleo RPC client            |
| `@fairdrop/sdk/transactions` | Transaction builders for all auction contracts   |
| `@fairdrop/sdk/token-registry` | Token registry reads and transaction builders  |
| `@fairdrop/sdk/credits`  | Credits unit conversion and shield transaction       |
| `@fairdrop/sdk/chain`    | On-chain mapping reads for all contracts             |
| `@fairdrop/sdk/hash`     | Op hash computation and ID generation                |
| `@fairdrop/sdk/parse`    | Leo plaintext and record field parsing               |
| `@fairdrop/sdk/format`   | Display formatting, amount parsing, Leo literals     |
| `@fairdrop/sdk/records`  | Auction record parsing and scanning                  |
| `@fairdrop/sdk/multisig` | Multisig governance workflow helpers                 |
| `@fairdrop/sdk/constants`| Protocol program IDs and zero address                |

---

## `client`

Singleton wrapper around `AleoNetworkClient`. Must be initialized once before any `chain` reads are made.

```ts
import { initAleoClient } from '@fairdrop/sdk/client';

initAleoClient('https://api.explorer.provable.com/v1');
```

Call this at app startup (e.g. in your environment/provider setup). Subsequent calls with the same URL are no-ops.

---

## `transactions`

Typed builders for every on-chain transition. Each returns a `TxSpec` ready to pass to `executeTransaction`. The `TxSpec.inputs` array holds `(string | Record<string, unknown>)[]` — wallet record objects are passed as-is and cast to `string[]` at the call site.

### Auction lifecycle

```ts
import {
  buildCreateAuction,
  closeAuction,
  cancelAuction,
  withdrawPayments,
  withdrawUnsold,
} from '@fairdrop/sdk/transactions';

// Create — nonce from fetchCreatorNonce(), protocolConfig from fetchProtocolConfig()
const spec = buildCreateAuction({
  type:         AuctionType.Dutch,
  tokenRecord:  rec._record,
  saleTokenId:  '123...field',
  supply:       1_000_000n,
  startBlock:   100_000,
  endBlock:     101_000,
  maxBidAmount: 5_000_000n,
  minBidAmount: 100_000n,
  saleScale:    1_000_000n,
  nonce:        0n,
  metadataHash: '0field',
  gate:     { gateMode: 0, merkleRoot: '0field', issuer: ZERO_ADDRESS },
  vest:     { vestEnabled: false, vestCliffBlocks: 0, vestEndBlocks: 0 },
  snapshot: { feeBps: 250, creationFee: 10_000n, closerReward: 10_000n, slashRewardBps: 2000, referralPoolBps: 500 },
  // type-specific fields:
  startPrice: 2_000_000n, floorPrice: 500_000n, priceDecayBlocks: 10, priceDecayAmount: 100_000n,
});

// Close / cancel
const closeSpec  = closeAuction(auctionId, programId);
const cancelSpec = cancelAuction(auctionId, programId);
```

### Bids

```ts
import { placeBidPublic, placeBidPrivate } from '@fairdrop/sdk/transactions';

const spec = placeBidPublic({ auctionId, bidAmount: 1_000_000n, nonce: 0n, programId });
const spec = placeBidPrivate({ auctionId, creditRecord: rec._record, bidAmount: 1_000_000n, nonce: 0n, programId });
```

### Claims

```ts
import { claimBid, claimVested, claimVoided } from '@fairdrop/sdk/transactions';

const spec = claimBid(bidRecord, auctionId, programId);
const spec = claimVested(vestRecord);
const spec = claimVoided(bidRecord);
```

### Gate proofs

```ts
import { verifyMerkle, verifyCredential } from '@fairdrop/sdk/transactions';

// Merkle: proof is 20 sibling field strings, pathBits is packed u32
const spec = verifyMerkle(auctionId, siblings, pathBits);

// Credential: signature is a 'sign1...' string from the issuer
const spec = verifyCredential(auctionId, issuer, signature, expiry);
```

### Referral

```ts
import { createReferralCode, creditCommission, claimCommission } from '@fairdrop/sdk/transactions';

const spec = createReferralCode(auctionId, refId, programId);
const spec = claimCommission(refRecord);
```

---

## `token-registry`

Reads and transaction builders for `token_registry.aleo`.

```ts
import {
  fetchTokenInfo,
  fetchTokenBalance,
  fetchTokenRole,
  registerToken,
  mintPrivate,
  burnPrivate,
  splitToken,
  joinTokens,
  setRole,
  removeRole,
  authorizeSupplyManager,
} from '@fairdrop/sdk/token-registry';

// Chain reads
const info    = await fetchTokenInfo(tokenId);
const balance = await fetchTokenBalance(address, tokenId);
const role    = await fetchTokenRole(address, tokenId);

// Register a new token (nameU128 / symbolU128 from asciiToU128 in @fairdrop/sdk/parse)
const spec = registerToken(tokenId, nameU128, symbolU128, decimals, maxSupply, adminAddress);

// Mint / burn / split / join
const spec = mintPrivate(tokenId, recipientAddress, amount);
const spec = burnPrivate(rec._record, amount);
const spec = splitToken(rec._record, splitAmount);
const spec = joinTokens(rec1._record, rec2._record);

// Role management (only token admin)
const spec = setRole(tokenId, account, TOKEN_ROLE.MINTER);
const spec = removeRole(tokenId, account);

// Authorize a program as supply manager (e.g. auction or vest program)
const spec = authorizeSupplyManager(tokenId, programAddress);
```

---

## `credits`

Unit conversion for Aleo credits (1 ALEO = 1,000,000 microcredits) and the shield transaction.

```ts
import {
  aleoToMicro,
  microToAleo,
  formatMicrocredits,
  shieldCredits,
  CREDITS_DECIMALS,
  CREDITS_SYMBOL,
} from '@fairdrop/sdk/credits';

aleoToMicro('1.5')        // → 1_500_000n  (returns null on invalid input)
microToAleo(1_500_000n)   // → '1.5'
formatMicrocredits(1_500_000n) // → '1.500000 ALEO'

// Move credits from public balance to a private record
const spec = shieldCredits(recipientAddress, 1_500_000n);
```

---

## `chain`

All on-chain mapping reads, grouped by contract. Requires `initAleoClient` to have been called.

```ts
import {
  fetchAuctionConfig,
  fetchAuctionState,
  fetchCreatorNonce,
  fetchProtocolConfig,
  fetchGateConfig,
  fetchTokenInfo,    // also in @fairdrop/sdk/token-registry
  fetchReferralRecord,
  fetchIsMultisigInitialized,
} from '@fairdrop/sdk/chain';

const config    = await fetchAuctionConfig(auctionId);
const state     = await fetchAuctionState(auctionId);
const nonce     = await fetchCreatorNonce(address, programId);  // required for buildCreateAuction
const protocol  = await fetchProtocolConfig();
const gate      = await fetchGateConfig(auctionId);             // { gate_mode, merkle_root, issuer }
const ref       = await fetchReferralRecord(refId);
const msigReady = await fetchIsMultisigInitialized();
```

---

## `hash`

Compute the mapping keys and op hashes used by Fairdrop contracts. Inputs must match the exact Leo struct field order.

```ts
import {
  computeAuctionId,
  computeBidderKey,
  computeTokenOwnerKey,
  computeConfigOpHash,
  generateTokenId,
  generateNonce,
} from '@fairdrop/sdk/hash';

const auctionId  = computeAuctionId(creator, saleTokenId, nonce);
const bidderKey  = computeBidderKey(bidder, auctionId);
const tokenId    = generateTokenId();   // random field for new token registration
const nonce      = generateNonce();
```

---

## `parse`

Parse Leo plaintext strings (from RPC mapping values and wallet records) into typed values.

```ts
import {
  parseU128, parseU64, parseU32, parseU8,
  parseField, parseAddress, parseBool,
  parseStruct, isValidField,
  asciiToU128, u128ToAscii,
  recField, recU128, recU32, hasRecordKey,
} from '@fairdrop/sdk/parse';

parseU128('1000000u128')   // → 1_000_000n
parseField('123...field')  // → '123...field' (validated)
isValidField('123...field') // → true

// Token name encoding
asciiToU128('MyToken')    // → bigint (throws if > 16 ASCII chars)
u128ToAscii(bigintValue)  // → 'MyToken'

// Record field access
recField(record, 'token_id')    // → field string
recU128(record, 'amount')       // → bigint
hasRecordKey(record, 'amount')  // → boolean
```

---

## `format`

Display formatting and Leo literal serializers. Used when building transaction inputs manually.

```ts
import {
  formatAmount,
  parseTokenAmount,
  truncateAddress,
  u128, u64, u32, u8,
  leoStruct,
  toFieldLiteral,
  aleou128,
} from '@fairdrop/sdk/format';

// Display
formatAmount(1_000_000n, 6)      // → '1.000000'
parseTokenAmount('1.5', 6)       // → 1_500_000n
truncateAddress('aleo1abc...xyz') // → 'aleo1abc…xyz'

// Leo literals (for custom input builders)
u128(1_000_000n)          // → '1000000u128'
aleou128('1.5')           // → '1500000u128'
leoStruct({ a: '1u8' })   // → '{ a: 1u8 }'
toFieldLiteral('0x1234')  // → '..field'
```

---

## `records`

Parse and scan wallet record objects returned by `requestRecords()`.

```ts
import {
  parseBidRecord,
  parseCommitmentRecord,
  scanBidRecords,
  scanCommitmentRecords,
  scanAuctionRecords,
} from '@fairdrop/sdk/records';

// From wallet adapter requestRecords()
const rawRecords = await requestRecords(programId);
const bids       = scanBidRecords(rawRecords);
const commits    = scanCommitmentRecords(rawRecords);

// Parse a single record
const bid = parseBidRecord(rawRecord);
// → { auctionId, amount, nonce, spent, _record }
```

---

## `multisig`

Two-phase multisig governance for admin operations. Used by protocol admins only.

```ts
import {
  prepareApproveOp,
  submitApproveOp,
  initializeMultisig,
  UPGRADE_KEY,
  CONFIG_OP_KEY,
} from '@fairdrop/sdk/multisig';

// Phase 1: each admin prepares a message hash and signs it off-chain
const msgHash = prepareApproveOp(opHash);

// Phase 2: submit with 3-of-5 admin signatures
const spec = submitApproveOp(opHash, [sig1, sig2, sig3], [admin1, admin2, admin3]);
```

---

## `constants`

```ts
import { SYSTEM_PROGRAMS, ZERO_ADDRESS } from '@fairdrop/sdk/constants';

SYSTEM_PROGRAMS.credits       // 'credits.aleo'
SYSTEM_PROGRAMS.tokenRegistry // 'token_registry.aleo'
ZERO_ADDRESS                  // 'aleo1qqq...qqq3ljyzc'
```
