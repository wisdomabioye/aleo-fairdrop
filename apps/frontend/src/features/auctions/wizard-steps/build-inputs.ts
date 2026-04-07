/**
 * Thin adapter: WizardForm → CreateAuctionInput → TxSpec.
 *
 * Converts string form values to the typed bigint/number inputs expected by
 * buildCreateAuction in @fairdrop/sdk/transactions. Leo serialization lives in
 * the SDK; this file only handles the WizardForm → SDK boundary.
 */
import type { ProtocolConfig }  from '@fairdrop/types/domain';
import { aleoToMicro }          from '@fairdrop/sdk/credits';
import { ZERO_ADDRESS }         from '@fairdrop/sdk/constants';
import type { TxSpec } from '@fairdrop/sdk/transactions';
import { getRegistrySlot }      from '../registry';
import type { WizardForm }      from './types';

const mic = (v: string) => aleoToMicro(v) ?? 0n;
const blk = (v: string) => parseInt(v || '0');

export function buildCreateAuctionInputs(
  form:           WizardForm,
  nonce:          bigint,
  protocolConfig: ProtocolConfig,
): TxSpec {
  const { auctionType, pricing, tokenRecord } = form;
  if (!auctionType) throw new Error('Auction type is required.');
  if (!pricing)     throw new Error('Pricing config is required.');
  if (!tokenRecord) throw new Error('Token record is required.');

  const slot = getRegistrySlot(auctionType);
  if (!slot) throw new Error(`Unknown auction type: ${auctionType}`);

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

  return slot.buildWizardInputs(pricing, base);
}
