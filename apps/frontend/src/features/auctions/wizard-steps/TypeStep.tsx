import { AuctionType } from '@fairdrop/types/domain';
import { AUCTION_REGISTRY } from '../registry';
import type { StepProps } from './types';

const TYPE_ICONS: Record<AuctionType, string> = {
  [AuctionType.Dutch]:     '📉',
  [AuctionType.Sealed]:    '🔒',
  [AuctionType.Raise]:     '🚀',
  [AuctionType.Ascending]: '📈',
  [AuctionType.Lbp]:       '⚖️',
  [AuctionType.Quadratic]: '🗳️',
};

export function TypeStep({ form, onChange }: StepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose the mechanism that best fits your token distribution goals.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Object.values(AUCTION_REGISTRY).map((slot) => {
          const isSelected = form.auctionType === slot.type;
          return (
            <button
              key={slot.type}
              type="button"
              onClick={() => onChange({ auctionType: slot.type, pricing: null })}
              className={[
                'flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/40',
              ].join(' ')}
            >
              <span className="text-2xl" role="img" aria-hidden="true">
                {TYPE_ICONS[slot.type]}
              </span>
              <span className={['inline-block w-fit rounded px-1.5 py-0.5 text-xs font-medium', slot.color].join(' ')}>
                {slot.label}
              </span>
              <p className="text-xs text-muted-foreground">{slot.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
