/**
 * Record parsing and scanning utilities for fairdrop auction records.
 *
 * import { scanBidRecords, scanCommitmentRecords, parseBidRecord } from '@fairdrop/sdk/records'
 *
 * These are pure TypeScript functions — no React, no wallet adapter.
 * Wallet-adapter hooks call requestRecords(), then pass the result here.
 */

export { parseBidRecord, parseCommitmentRecord, BID_RECORD_NAMES } from './parse';
export { scanBidRecords, scanCommitmentRecords, scanAuctionRecords } from './scan';
