import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, TokenAmountInput, Spinner,
} from '@/components';
import { formatAmount } from '@fairdrop/sdk/format';
import { parseExecutionError } from '@/shared/utils/errors';

export interface RegisterTokenFormProps {
  tokenId: string;

  // Field values
  name: string;
  symbol: string;
  decimals: string;
  maxSupply: string;

  // Derived / validation
  dec: number;
  maxRaw: bigint;
  nameU128: bigint | null;
  symbolU128: bigint | null;
  nameError: string;
  symbolError: string;
  isValid: boolean;

  // Tx state
  busy: boolean;
  isWaiting: boolean;
  error: Error | null;

  onChange: (field: 'name' | 'symbol' | 'decimals' | 'maxSupply', value: string) => void;
  onSubmit: () => void;
}

export function RegisterTokenForm({
  tokenId,
  name, symbol, decimals, maxSupply,
  dec, maxRaw, nameU128, symbolU128, nameError, symbolError, isValid,
  busy, isWaiting, error,
  onChange, onSubmit,
}: RegisterTokenFormProps) {
  const blocked = busy || isWaiting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1 · Register Token</CardTitle>
        <CardDescription>
          Create a new token entry on <code>token_registry.aleo</code>. Your address becomes the token admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token ID */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-1">Token ID (auto-generated)</p>
          <p className="break-all font-mono text-xs">{tokenId}</p>
        </div>

        {/* Name + Symbol */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="My Token"
              value={name}
              onChange={(e) => onChange('name', e.target.value)}
              disabled={blocked}
            />
            {name && nameError && <p className="text-xs text-destructive">{nameError}</p>}
            <p className="text-xs text-muted-foreground">Max 16 ASCII chars</p>
          </div>
          <div className="space-y-1.5">
            <Label>Symbol</Label>
            <Input
              placeholder="MTK"
              value={symbol}
              onChange={(e) => onChange('symbol', e.target.value.toUpperCase())}
              disabled={blocked}
            />
            {symbol && symbolError && <p className="text-xs text-destructive">{symbolError}</p>}
            <p className="text-xs text-muted-foreground">2–8 chars</p>
          </div>
        </div>

        {/* Decimals + Max Supply */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Decimals</Label>
            <Input
              type="number" min="0" max="18"
              value={decimals}
              onChange={(e) => onChange('decimals', e.target.value)}
              disabled={blocked}
            />
          </div>
          <TokenAmountInput
            label="Max Supply"
            value={maxSupply}
            onChange={(v) => onChange('maxSupply', v)}
            decimals={isNaN(dec) ? 0 : dec}
            placeholder="1000000"
            hint="Human-readable total supply"
          />
        </div>

        {/* Preview */}
        {nameU128 && symbolU128 && name && symbol && maxRaw > 0n && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium text-primary">Preview: </span>
            <span className="text-muted-foreground">
              {name} <code className="text-foreground">({symbol})</code>
              {' · '}{dec} decimals{' · '}max {formatAmount(BigInt(maxSupply))} tokens
            </span>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{parseExecutionError(error)}</p>}

        <Button className="w-full" onClick={onSubmit} disabled={!isValid || blocked}>
          {busy
            ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
            : isWaiting
              ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
              : 'Register Token →'
          }
        </Button>
      </CardContent>
    </Card>
  );
}
