import { ArrowLeftRight } from 'lucide-react';
import { TokenSearchCombobox } from './TokenSearchCombobox';
import type { TokenDisplay } from '@/config/well-known-tokens';

interface TokenPairDisplayProps {
  tokenA:         TokenDisplay | null;
  tokenB:         TokenDisplay | null;
  onChangeTokenA: (t: TokenDisplay) => void;
  onChangeTokenB: (t: TokenDisplay) => void;
}

export function TokenPairDisplay({
  tokenA,
  tokenB,
  onChangeTokenA,
  onChangeTokenB,
}: TokenPairDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <TokenSearchCombobox
          token={tokenA}
          onChange={onChangeTokenA}
          exclude={tokenB?.tokenId ?? null}
          label="Token A"
        />
      </div>
      <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <TokenSearchCombobox
          token={tokenB}
          onChange={onChangeTokenB}
          exclude={tokenA?.tokenId ?? null}
          label="Token B"
        />
      </div>
    </div>
  );
}
