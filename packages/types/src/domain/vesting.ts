/**
 * Domain-level vesting types.
 */

/** Status of a vesting position at a given block height. */
export enum VestingStatus {
  /** ended_at_block + cliff_blocks not yet reached. */
  Locked    = 'locked',
  /** Cliff reached; partial release available. */
  Vesting   = 'vesting',
  /** ended_at_block + vest_end_blocks reached; full amount releasable. */
  FullyVested = 'fully_vested',
  /** All tokens have been released. */
  Completed = 'completed',
}

/** Vesting schedule derived from a VestedAllocation record + current block. */
export interface VestingSchedule {
  auctionId:       string;
  saleTokenId:     string;
  saleTokenSymbol: string | null;
  totalAmount:     bigint;
  claimed:         bigint;
  remaining:       bigint;
  releasable:      bigint;
  status:          VestingStatus;

  /** Block numbers */
  endedAtBlock:    number;
  cliffBlock:      number;   // endedAtBlock + cliff_blocks
  vestEndBlock:    number;   // endedAtBlock + vest_end_blocks

  /** Wall-clock approximations */
  estimatedCliff:   Date | null;
  estimatedVestEnd: Date | null;
}
