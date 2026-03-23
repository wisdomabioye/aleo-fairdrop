import type { ProtocolConfig } from '@fairdrop/types/domain';
import type { StepProps } from './types';

interface ReferralStepProps extends StepProps {
  protocolConfig: ProtocolConfig;
}

export function ReferralStep({ protocolConfig }: ReferralStepProps) {
  const feePct         = (protocolConfig.feeBps         / 100).toFixed(2);
  const referralPoolPct = (protocolConfig.referralPoolBps / 100).toFixed(2);
  const maxReferralPct  = (protocolConfig.maxReferralBps  / 100).toFixed(2);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your auction automatically supports referrals. Here's how the economics work.
      </p>

      <div className="rounded-md border border-border bg-muted/40 divide-y divide-border text-sm">
        <div className="flex justify-between px-4 py-3">
          <span className="text-muted-foreground">Protocol fee</span>
          <span>{feePct}% of total payments at close</span>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-muted-foreground">Referral budget allocation</span>
          <span>{referralPoolPct}% of the protocol fee</span>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-muted-foreground">Max referrer commission</span>
          <span>up to {maxReferralPct}% of each bid</span>
        </div>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          When a bidder uses a referral link, their referrer earns a commission paid
          from the auction's referral budget.
        </p>
        <p>
          You can push additional credits into your auction's referral pool at any time
          after creation using the <strong>Push Referral Budget</strong> action on the
          auction detail page.
        </p>
      </div>
    </div>
  );
}
