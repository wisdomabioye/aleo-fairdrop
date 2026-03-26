/**
 * Assembles the `executeTransaction` payload for `create_auction`.
 *
 * Leo scalar/struct helpers are imported from @fairdrop/sdk/format — the SDK
 * owns typed literal construction.  The auction-specific parameter mapping
 * lives here (web-app scope) so the SDK has no knowledge of wizard state or
 * domain business rules.
 */
import { AuctionType }         from '@fairdrop/types/domain';
import type { ProtocolConfig } from '@fairdrop/types/domain';
import type { FairdropConfig } from '@fairdrop/config';
import {
  aleou128,
  parseTokenAmount,
  u128, u64, u32, u16, u8,
  toFieldLiteral, leoStruct,
} from '@fairdrop/sdk/format';
import { ZERO_ADDRESS } from '@fairdrop/sdk/constants';
import type { WizardForm } from './types';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from '../pricing-steps/types';
import { TX_DEFAULT_FEE } from '@/env';

// ── helpers ───────────────────────────────────────────────────────────────────


function buildGate(form: WizardForm): string {
  return leoStruct({
    gate_mode:   u8(form.gateMode),
    merkle_root: form.gateMode === 1 ? toFieldLiteral(form.merkleRoot) : '0field',
    issuer:      form.gateMode === 2 ? form.issuerAddress : ZERO_ADDRESS,
  });
}

function buildVest(form: WizardForm): string {
  return leoStruct({
    vest_enabled:      String(form.vestEnabled),
    vest_cliff_blocks: u32(form.vestCliffBlocks || '0'),
    vest_end_blocks:   u32(form.vestEndBlocks   || '0'),
  });
}

function buildSnapshot(pc: ProtocolConfig): string {
  return leoStruct({
    fee_bps:           u16(pc.feeBps),
    creation_fee:      u128(pc.creationFee),
    closer_reward:     u128(pc.closerReward),
    slash_reward_bps:  u16(pc.slashRewardBps),
    referral_pool_bps: u16(pc.referralPoolBps),
  });
}

/** Shared positional inputs that come before the type-specific param. */
function commonInputs(form: WizardForm, nonce: bigint): string[] {
  return [
    form.saleTokenId,
    u128(form.supply),
    u32(form.startBlock),
    u32(form.endBlock),
    u128(parseTokenAmount(form.maxBidAmount, form.tokenDecimals)),
    u128(parseTokenAmount(form.minBidAmount, form.tokenDecimals)),
    u128(form.saleScale),
    u64(nonce),
    form.metadataHash,
  ];
}

// ── public types ──────────────────────────────────────────────────────────────

export interface CreateAuctionTx {
  program:  string;
  function: 'create_auction';
  inputs:   (string | Record<string, unknown>)[];
  fee:      number;
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Build the `executeTransaction` payload for `create_auction`.
 *
 * @param form           - Completed wizard form state.
 * @param nonce          - Current value of `creator_nonces[creator]` on-chain (0n if never created).
 * @param protocolConfig - Live protocol config from the API.
 * @param appConfig      - FairdropConfig (provides program IDs).
 */
export function buildCreateAuctionInputs(
  form:           WizardForm,
  nonce:          bigint,
  protocolConfig: ProtocolConfig,
  appConfig:      FairdropConfig,
): CreateAuctionTx {
  const { auctionType, pricing, tokenRecord } = form;

  if (!auctionType) throw new Error('Auction type is required.');
  if (!pricing)     throw new Error('Pricing config is required.');
  if (!tokenRecord) throw new Error('Token record is required.');

  const common   = commonInputs(form, nonce);
  const gate     = buildGate(form);
  const vest     = buildVest(form);
  const snapshot = buildSnapshot(protocolConfig);
  const tail     = [gate, vest, snapshot];

  switch (auctionType) {
    case AuctionType.Dutch: {
      const p = pricing as DutchPricingValues;
      return {
        program:  appConfig.programs.dutch.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          ...common,
          leoStruct({
            start_price:        aleou128(p.startPrice),
            floor_price:        aleou128(p.floorPrice),
            price_decay_blocks: u32(p.priceDecayBlocks || '0'),
            price_decay_amount: aleou128(p.priceDecayAmount),
          }),
          ...tail,
        ],
      };
    }

    case AuctionType.Sealed: {
      const p = pricing as SealedPricingValues;
      const commitEnd = parseInt(form.startBlock || '0') + parseInt(p.commitEndBlockOffset || '0');
      return {
        program:  appConfig.programs.sealed.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          ...common,
          leoStruct({
            start_price:        aleou128(p.startPrice),
            floor_price:        aleou128(p.floorPrice),
            price_decay_blocks: u32(p.priceDecayBlocks || '0'),
            price_decay_amount: aleou128(p.priceDecayAmount),
            commit_end_block:   u32(commitEnd),
          }),
          ...tail,
        ],
      };
    }

    case AuctionType.Ascending: {
      const p = pricing as AscendingPricingValues;
      return {
        program:  appConfig.programs.ascending.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          ...common,
          leoStruct({
            floor_price:       aleou128(p.floorPrice),
            ceiling_price:     aleou128(p.ceilingPrice),
            price_rise_blocks: u32(p.priceRiseBlocks || '0'),
            price_rise_amount: aleou128(p.priceRiseAmount),
          }),
          ...tail,
        ],
      };
    }

    case AuctionType.Raise: {
      const p = pricing as RaisePricingValues;
      const [
        saleTokenId,
        supply,
        ...restArgs
      ] = common;
      return {
        program:  appConfig.programs.raise.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          saleTokenId,
          supply,
          aleou128(p.raiseTarget), // Raise has no struct — just raise_target u128
          ...restArgs,
          ...tail,
        ],
      };
    }

    case AuctionType.Lbp: {
      const p = pricing as LbpPricingValues;
      return {
        program:  appConfig.programs.lbp.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          ...common,
          leoStruct({
            start_weight:  u16(p.startWeight  || '0'),
            end_weight:    u16(p.endWeight    || '0'),
            swap_fee_bps:  u16(p.swapFeeBps  || '0'),
            initial_price: aleou128(p.initialPrice),
          }),
          ...tail,
        ],
      };
    }

    case AuctionType.Quadratic: {
      const p = pricing as QuadraticPricingValues;
      const deadline = parseInt(form.startBlock || '0') + parseInt(p.matchingDeadlineOffset || '0');
      return {
        program:  appConfig.programs.quadratic.programId,
        function: 'create_auction',
        fee: TX_DEFAULT_FEE,
        inputs: [
          tokenRecord,
          ...common,
          leoStruct({
            matching_pool:     aleou128(p.matchingPool),
            contribution_cap:  aleou128(p.contributionCap),
            matching_deadline: u32(deadline),
          }),
          ...tail,
        ],
      };
    }

    default:
      throw new Error(`Unknown auction type: ${String(auctionType)}`);
  }
}
