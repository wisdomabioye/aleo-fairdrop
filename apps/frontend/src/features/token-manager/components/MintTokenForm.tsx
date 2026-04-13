import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  TokenAmountInput, Spinner,
} from '@/components';
import { CheckCircle2 } from 'lucide-react';
import { formatAmount } from '@fairdrop/sdk/format';
import { parseExecutionError } from '@/shared/utils/errors';
import { PrivacyModeToggle } from '@/shared/components/PrivacyModeToggle';

export interface MintTokenFormProps {
  symbol: string;
  decimals: number;
  maxRaw: bigint;

  mintAmount: string;
  mintRaw: bigint;
  isValid: boolean;

  mintMode: 'private' | 'public';
  onModeChange: (mode: 'private' | 'public') => void;

  busy: boolean;
  isWaiting: boolean;
  error: Error | null;

  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function MintTokenForm({
  symbol, decimals, maxRaw,
  mintAmount, mintRaw, isValid,
  mintMode, onModeChange,
  busy, isWaiting, error,
  onChange, onSubmit,
}: MintTokenFormProps) {
  const blocked = busy || isWaiting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>2 · Mint Initial Supply</CardTitle>
        <CardDescription>
          Mint tokens to your wallet. Private creates a record; public credits your on-chain balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Token registered on-chain. Ready to mint.
          </p>
        </div>

        <PrivacyModeToggle mode={mintMode} onChange={onModeChange} />

        <TokenAmountInput
          label="Mint Amount"
          value={mintAmount}
          onChange={onChange}
          decimals={decimals}
          symbol={symbol || undefined}
          max={maxRaw}
          maxLabel="Full supply"
          placeholder={formatAmount(maxRaw, decimals)}
          error={mintRaw > maxRaw ? 'Exceeds max supply' : undefined}
        />

        {error && <p className="text-xs text-destructive">{parseExecutionError(error)}</p>}

        <Button className="w-full" onClick={onSubmit} disabled={!isValid || blocked}>
          {busy
            ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
            : isWaiting
              ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
              : 'Mint Tokens →'
          }
        </Button>
      </CardContent>
    </Card>
  );
}
