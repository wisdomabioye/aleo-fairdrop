import { eq }               from 'drizzle-orm';
import { protocolConfig }   from '@fairdrop/database';
import type { Db }          from '@fairdrop/database';
import type { ProtocolConfig } from '@fairdrop/types/domain';

/** Fetch the single protocol config row. Returns null if not yet indexed. */
export async function getProtocolConfig(db: Db): Promise<ProtocolConfig | null> {
  const rows = await db
    .select()
    .from(protocolConfig)
    .where(eq(protocolConfig.id, 1))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0]!;

  return {
    feeBps:             row.feeBps,
    creationFee:        row.creationFee,
    closerReward:       row.closerReward,
    slashRewardBps:     row.slashRewardBps,
    maxReferralBps:     row.maxReferralBps,
    referralPoolBps:    row.referralPoolBps,
    minAuctionDuration: row.minAuctionDuration,
    paused:             row.paused,
    updatedAt:          row.updatedAt.toISOString(),
  };
}
