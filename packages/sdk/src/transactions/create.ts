/**
 * Transaction builder for create_auction.
 *
 * Encodes the exact input ordering for every auction type's create_auction
 * transition. All token amounts must be in base units (already scaled by
 * saleScale / 10^decimals). The nonce is the live on-chain
 * creator_nonces[creator] value (fetch with fetchCreatorNonce before calling).
 *
 * The token record input is a wallet record object at runtime, so the return
 * type uses CreateAuctionSpec (inputs: (string | Record<string, unknown>)[]).
 */

import { PROGRAMS }    from '@fairdrop/config';
import { AuctionType } from '@fairdrop/types/domain';
import { u128, u64, u32, u16, u8, leoStruct, toFieldLiteral } from '../format/leo';
import { ZERO_ADDRESS }    from '../constants';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

// ── Input type definitions ─────────────────────────────────────────────────────

export interface GateInput {
  /** 0 = open, 1 = Merkle allowlist, 2 = credential */
  gateMode:   0 | 1 | 2;
  /** BHP256 Merkle root field. Must be '0field' when gateMode !== 1. */
  merkleRoot: string;
  /** Credential issuer address. Must be ZERO_ADDRESS when gateMode !== 2. */
  issuer:     string;
}

export interface VestInput {
  vestEnabled:     boolean;
  /** Blocks after end_block before any tokens vest. 0 = no cliff. */
  vestCliffBlocks: number;
  /** Blocks after end_block when 100% is vested. Must be > vestCliffBlocks. */
  vestEndBlocks:   number;
}

export interface ConfigSnapshotInput {
  feeBps:          number;
  creationFee:     bigint;
  closerReward:    bigint;
  slashRewardBps:  number;
  referralPoolBps: number;
}

interface CreateBase {
  /** Token record to burn as sale supply (wallet record object or raw string). */
  tokenRecord:   string | Record<string, unknown>;
  saleTokenId:   string;   // field
  /** Total sale supply in base units. */
  supply:        bigint;
  startBlock:    number;
  endBlock:      number;
  /** Per-bidder payment cap in base units. 0 = no cap. */
  maxBidAmount:  bigint;
  minBidAmount:  bigint;
  /** 10^decimals — used to convert token amounts to/from base units. */
  saleScale:     bigint;
  /** D11: current creator_nonces[creator] on-chain. Fetch with fetchCreatorNonce. */
  nonce:         bigint;
  /** BHP256 hash of off-chain metadata. '0field' if no metadata. */
  metadataHash:  string;
  gate:          GateInput;
  vest:          VestInput;
  snapshot:      ConfigSnapshotInput;
  fee?:          number;
}

export type CreateAuctionInput =
  | (CreateBase & {
      type:             AuctionType.Dutch;
      startPrice:       bigint;
      floorPrice:       bigint;
      priceDecayBlocks: number;
      priceDecayAmount: bigint;
    })
  | (CreateBase & {
      type:             AuctionType.Sealed;
      startPrice:       bigint;
      floorPrice:       bigint;
      priceDecayBlocks: number;
      priceDecayAmount: bigint;
      /** Absolute block height — last block where bids can be committed. */
      commitEndBlock:   number;
    })
  | (CreateBase & {
      type:             AuctionType.Ascending;
      floorPrice:       bigint;
      ceilingPrice:     bigint;
      priceRiseBlocks:  number;
      priceRiseAmount:  bigint;
    })
  | (CreateBase & {
      type:        AuctionType.Raise;
      raiseTarget: bigint;
    })
  | (CreateBase & {
      type:       AuctionType.Lbp;
      /** Maximum price per token (supply full, t=0). In base units. */
      startPrice: bigint;
      /** Minimum price per token (floor regardless of supply/time). In base units. */
      floorPrice: bigint;
    })
  | (CreateBase & {
      type:        AuctionType.Quadratic;
      /** Minimum total credits for the auction to clear. In base units. */
      raiseTarget: bigint;
    });

// ── Shared serializers ────────────────────────────────────────────────────────

function buildGate(gate: GateInput): string {
  return leoStruct({
    gate_mode:   u8(gate.gateMode),
    merkle_root: toFieldLiteral(gate.merkleRoot),
    issuer:      gate.issuer || ZERO_ADDRESS,
  });
}

function buildVest(vest: VestInput): string {
  return leoStruct({
    vest_enabled:      String(vest.vestEnabled),
    vest_cliff_blocks: u32(vest.vestCliffBlocks),
    vest_end_blocks:   u32(vest.vestEndBlocks),
  });
}

function buildSnapshot(snap: ConfigSnapshotInput): string {
  return leoStruct({
    fee_bps:           u16(snap.feeBps),
    creation_fee:      u128(snap.creationFee),
    closer_reward:     u128(snap.closerReward),
    slash_reward_bps:  u16(snap.slashRewardBps),
    referral_pool_bps: u16(snap.referralPoolBps),
  });
}

function commonInputs(p: CreateBase): string[] {
  return [
    p.saleTokenId,
    u128(p.supply),
    u32(p.startBlock),
    u32(p.endBlock),
    u128(p.maxBidAmount),
    u128(p.minBidAmount),
    u128(p.saleScale),
    u64(p.nonce),
    toFieldLiteral(p.metadataHash),
  ];
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build the executeTransaction payload for create_auction.
 *
 * All amounts must be in base units (scaled by saleScale / 10^decimals).
 * Pass the result directly to executeTransaction().
 */
export function buildCreateAuction(p: CreateAuctionInput): TxSpec {
  const common   = commonInputs(p);
  const gate     = buildGate(p.gate);
  const vest     = buildVest(p.vest);
  const snapshot = buildSnapshot(p.snapshot);
  const tail     = [gate, vest, snapshot];
  const fee      = p.fee ?? DEFAULT_TX_FEE;

  switch (p.type) {
    case AuctionType.Dutch:
      return {
        program: PROGRAMS.dutch.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [
          p.tokenRecord, ...common,
          leoStruct({
            start_price:        u128(p.startPrice),
            floor_price:        u128(p.floorPrice),
            price_decay_blocks: u32(p.priceDecayBlocks),
            price_decay_amount: u128(p.priceDecayAmount),
          }),
          ...tail,
        ],
      };

    case AuctionType.Sealed:
      return {
        program: PROGRAMS.sealed.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [
          p.tokenRecord, ...common,
          leoStruct({
            start_price:        u128(p.startPrice),
            floor_price:        u128(p.floorPrice),
            price_decay_blocks: u32(p.priceDecayBlocks),
            price_decay_amount: u128(p.priceDecayAmount),
            commit_end_block:   u32(p.commitEndBlock),
          }),
          ...tail,
        ],
      };

    case AuctionType.Ascending:
      return {
        program: PROGRAMS.ascending.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [
          p.tokenRecord, ...common,
          leoStruct({
            floor_price:       u128(p.floorPrice),
            ceiling_price:     u128(p.ceilingPrice),
            price_rise_blocks: u32(p.priceRiseBlocks),
            price_rise_amount: u128(p.priceRiseAmount),
          }),
          ...tail,
        ],
      };

    case AuctionType.Raise: {
      // Raise has no params struct — raise_target is a flat positional input.
      const [tokenId, supply, ...rest] = common;
      return {
        program: PROGRAMS.raise.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [p.tokenRecord, tokenId, supply, u128(p.raiseTarget), ...rest, ...tail],
      };
    }

    case AuctionType.Lbp:
      // lbp: LbpParams { start_price, floor_price } is a positional struct after common inputs.
      return {
        program: PROGRAMS.lbp.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [
          p.tokenRecord, ...common,
          leoStruct({ start_price: u128(p.startPrice), floor_price: u128(p.floorPrice) }),
          ...tail,
        ],
      };

    case AuctionType.Quadratic: {
      // raise_target is a flat positional input between supply and start_block — same layout as Raise.
      const [tokenId, supply, ...rest] = common;
      return {
        program: PROGRAMS.quadratic.programId, function: 'create_auction', fee, privateFee: false,
        inputs: [p.tokenRecord, tokenId, supply, u128(p.raiseTarget), ...rest, ...tail],
      };
    }
  }
}
