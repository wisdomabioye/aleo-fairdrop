/**
 * Thin adapter: WizardForm → CreateAuctionInput → TxSpec.
 *
 * Converts string form values to the typed bigint/number inputs expected by
 * buildCreateAuction in @fairdrop/sdk/transactions. Leo serialization lives in
 * the SDK; this file only handles the WizardForm → SDK boundary.
 */
import { AuctionType }          from '@fairdrop/types/domain';
import type { ProtocolConfig }  from '@fairdrop/types/domain';
import { aleoToMicro }          from '@fairdrop/sdk/credits';
import { ZERO_ADDRESS }         from '@fairdrop/sdk/constants';
import { buildCreateAuction, type TxSpec } from '@fairdrop/sdk/transactions';
import type { WizardForm }      from './types';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from '../pricing-steps/types';

function mic(v: string): bigint { return aleoToMicro(v) ?? 0n; }
function blk(v: string): number { return parseInt(v || '0'); }

export function buildCreateAuctionInputs(
  form:           WizardForm,
  nonce:          bigint,
  protocolConfig: ProtocolConfig,
): TxSpec {
  const { auctionType, pricing, tokenRecord } = form;
  if (!auctionType) throw new Error('Auction type is required.');
  if (!pricing)     throw new Error('Pricing config is required.');
  if (!tokenRecord) throw new Error('Token record is required.');

  const base = {
    tokenRecord:  tokenRecord as string | Record<string, unknown>,
    saleTokenId:  form.saleTokenId,
    supply:       BigInt(form.supply || '0'),
    startBlock:   blk(form.startBlock),
    endBlock:     blk(form.endBlock),
    maxBidAmount: mic(form.maxBidAmount),
    minBidAmount: mic(form.minBidAmount),
    saleScale:    BigInt(form.saleScale || '1'),
    nonce,
    metadataHash: form.metadataHash,
    gate: {
      gateMode:   form.gateMode,
      merkleRoot: form.merkleRoot || '0field',
      issuer:     form.gateMode === 2 ? form.issuerAddress : ZERO_ADDRESS,
    },
    vest: {
      vestEnabled:     form.vestEnabled,
      vestCliffBlocks: blk(form.vestCliffBlocks),
      vestEndBlocks:   blk(form.vestEndBlocks),
    },
    snapshot: {
      feeBps:          protocolConfig.feeBps,
      creationFee:     BigInt(protocolConfig.creationFee),
      closerReward:    BigInt(protocolConfig.closerReward),
      slashRewardBps:  protocolConfig.slashRewardBps,
      referralPoolBps: protocolConfig.referralPoolBps,
    },
  };

  switch (auctionType) {
    case AuctionType.Dutch: {
      const p = pricing as DutchPricingValues;
      return buildCreateAuction({
        ...base, type: AuctionType.Dutch,
        startPrice:       mic(p.startPrice),
        floorPrice:       mic(p.floorPrice),
        priceDecayBlocks: blk(p.priceDecayBlocks),
        priceDecayAmount: mic(p.priceDecayAmount),
      });
    }
    case AuctionType.Sealed: {
      const p = pricing as SealedPricingValues;
      return buildCreateAuction({
        ...base, type: AuctionType.Sealed,
        startPrice:       mic(p.startPrice),
        floorPrice:       mic(p.floorPrice),
        priceDecayBlocks: blk(p.priceDecayBlocks),
        priceDecayAmount: mic(p.priceDecayAmount),
        commitEndBlock:   base.startBlock + blk(p.commitEndBlockOffset),
      });
    }
    case AuctionType.Ascending: {
      const p = pricing as AscendingPricingValues;
      return buildCreateAuction({
        ...base, type: AuctionType.Ascending,
        floorPrice:      mic(p.floorPrice),
        ceilingPrice:    mic(p.ceilingPrice),
        priceRiseBlocks: blk(p.priceRiseBlocks),
        priceRiseAmount: mic(p.priceRiseAmount),
      });
    }
    case AuctionType.Raise: {
      const p = pricing as RaisePricingValues;
      return buildCreateAuction({ ...base, type: AuctionType.Raise, raiseTarget: mic(p.raiseTarget) });
    }
    case AuctionType.Lbp: {
      const p = pricing as LbpPricingValues;
      return buildCreateAuction({
        ...base, type: AuctionType.Lbp,
        startPrice: mic(p.startPrice),
        floorPrice: mic(p.floorPrice),
      });
    }
    case AuctionType.Quadratic: {
      const p = pricing as QuadraticPricingValues;
      return buildCreateAuction({
        ...base, type: AuctionType.Quadratic,
        raiseTarget: mic(p.raiseTarget),
      });
    }
    default:
      throw new Error(`Unknown auction type: ${String(auctionType)}`);
  }
}
