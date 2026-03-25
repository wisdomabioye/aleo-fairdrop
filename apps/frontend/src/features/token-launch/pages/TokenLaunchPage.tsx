/**
 * Token Launch — 2-step wizard to register and mint a new ARC-20 token.
 *
 * Step 1: register_token on token_registry.aleo (auto-generated token_id)
 * Step 2: mint_private the initial supply to the creator's wallet
 */
import { useState } from 'react';
import { useWallet }         from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  PageHeader,
  TokenAmountInput,
  Input,
  Label,
  CopyField,
  Spinner,
} from '@/components';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { SYSTEM_PROGRAMS }   from '@fairdrop/sdk/constants';
import { asciiToU128 }    from '@fairdrop/sdk/parse';
import { parseTokenAmount, formatAmount } from '@fairdrop/sdk/format';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';
import { TX_DEFAULT_FEE } from '@/env';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;
const NO_EXPIRY      = 4294967295; // u32::MAX

// ── Utils ─────────────────────────────────────────────────────────────────────

function generateTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v.toString() + 'field';
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ n, current, done }: { n: number; current: number; done: boolean }) {
  const active = n === current;
  const past   = done || n < current;
  return (
    <div className="flex items-center gap-2">
      <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors
        ${past ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {past && !active ? <CheckCircle2 className="size-4" /> : n}
      </div>
      {n < 2 && <ChevronRight className="size-4 text-muted-foreground" />}
    </div>
  );
}

// ── TokenLaunchPage ───────────────────────────────────────────────────────────

export function TokenLaunchPage() {
  const { address, connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [step,    setStep]  = useState<1 | 2 | 'done'>(1);
  const [tokenId]           = useState(generateTokenId);
  const [busy,    setBusy]  = useState(false);
  const [error,   setError] = useState<string | null>(null);

  // Step 1 state
  const [name,      setName]      = useState('');
  const [symbol,    setSymbol]    = useState('');
  const [decimals,  setDecimals]  = useState('6');
  const [maxSupply, setMaxSupply] = useState('');

  // Step 2 state
  const [mintAmount, setMintAmount] = useState('');

  // Parsed values
  const dec     = parseInt(decimals, 10);
  const maxRaw  = parseTokenAmount(maxSupply, isNaN(dec) ? 0 : dec);
  const mintRaw = parseTokenAmount(mintAmount, isNaN(dec) ? 0 : dec);

  let nameU128: bigint | null   = null;
  let symbolU128: bigint | null = null;
  let nameError   = '';
  let symbolError = '';

  try { nameU128   = name   ? asciiToU128(name)   : null; } catch (e) { nameError   = e instanceof Error ? e.message : 'Invalid'; }
  try { symbolU128 = symbol ? asciiToU128(symbol) : null; } catch (e) { symbolError = e instanceof Error ? e.message : 'Invalid'; }

  const step1Valid = !!nameU128 && !!symbolU128 && symbol.length >= 2 &&
    !isNaN(dec) && dec >= 0 && dec <= 18 && maxRaw > 0n;

  const step2Valid = mintRaw > 0n && mintRaw <= maxRaw;

  async function runStep1() {
    if (!step1Valid || !address) return;
    setBusy(true); setError(null);
    try {
      const result = await executeTransaction({
        program:  TOKEN_REGISTRY,
        function: 'register_token',
        inputs:   [tokenId, `${nameU128}u128`, `${symbolU128}u128`, `${dec}u8`, `${maxRaw}u128`, 'false', address],
        fee:      TX_DEFAULT_FEE,
        privateFee: false,
      });
      if (result?.transactionId) { setTx(result.transactionId, 'Register Token'); setStep(2); }
    } catch (err) {
      setError(err instanceof Error ? err.message : parseExecutionError(err)); 
    }
    finally { setBusy(false); }
  }

  async function runStep2() {
    if (!step2Valid || !address) return;
    setBusy(true); setError(null);
    try {
      const result = await executeTransaction({
        program:  TOKEN_REGISTRY,
        function: 'mint_private',
        inputs:   [tokenId, address, `${mintRaw}u128`, 'false', `${NO_EXPIRY}u32`],
        fee:      TX_DEFAULT_FEE,
        privateFee: false,
      });
      if (result?.transactionId) { setTx(result.transactionId, 'Mint Tokens'); setStep('done'); }
    } catch (err) { 
      setError(err instanceof Error ? err.message : parseExecutionError(err)); 
    }
    finally { setBusy(false); }
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <PageHeader title="Token Launch" description="Register and mint a new ARC-20 token on Aleo." />
        <ConnectWalletPrompt message="Connect your wallet to launch a token." />
      </div>
    );
  }

  const currentStep = step === 'done' ? 3 : step;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <PageHeader title="Token Launch" description="Register and mint a new ARC-20 token on Aleo." />

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 py-2">
        {([1, 2] as const).map((n) => (
          <StepDot key={n} n={n} current={currentStep} done={step === 'done'} />
        ))}
      </div>

      {/* ── Step 1: Register ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1 · Register Token</CardTitle>
            <CardDescription>
              Create a new token entry on <code>{TOKEN_REGISTRY}</code>. Your address becomes the token admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Token ID (auto-generated)</p>
              <p className="break-all font-mono text-xs">{tokenId}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="My Token" value={name} onChange={(e) => setName(e.target.value)} />
                {name && nameError && <p className="text-xs text-destructive">{nameError}</p>}
                <p className="text-xs text-muted-foreground">Max 16 ASCII chars</p>
              </div>
              <div className="space-y-1.5">
                <Label>Symbol</Label>
                <Input placeholder="MTK" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
                {symbol && symbolError && <p className="text-xs text-destructive">{symbolError}</p>}
                <p className="text-xs text-muted-foreground">2–8 chars</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Decimals</Label>
                <Input type="number" min="0" max="18" value={decimals} onChange={(e) => setDecimals(e.target.value)} />
              </div>
              <TokenAmountInput
                label="Max Supply"
                value={maxSupply}
                onChange={setMaxSupply}
                decimals={isNaN(dec) ? 0 : dec}
                placeholder="1000000"
                hint="Human-readable total supply"
              />
            </div>
            {nameU128 && symbolU128 && name && symbol && maxRaw > 0n && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <span className="font-medium text-primary">Preview: </span>
                <span className="text-muted-foreground">
                  {name} <code className="text-foreground">({symbol})</code> · {dec} decimals · max {formatAmount(BigInt(maxSupply))} tokens
                </span>
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" onClick={runStep1} disabled={!step1Valid || busy}>
              {busy ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</> : 'Register Token →'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Mint ── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Mint Initial Supply</CardTitle>
            <CardDescription>
              Mint tokens to your wallet as a private record. You'll deposit these when creating an auction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TokenAmountInput
              label="Mint Amount"
              value={mintAmount}
              onChange={(v) => { setMintAmount(v); setError(null); }}
              decimals={isNaN(dec) ? 0 : dec}
              symbol={symbol || undefined}
              max={maxRaw}
              maxLabel="Full supply"
              placeholder={formatAmount(maxRaw, isNaN(dec) ? 0 : dec)}
              error={mintRaw > maxRaw ? 'Exceeds max supply' : undefined}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" onClick={runStep2} disabled={!step2Valid || busy}>
              {busy ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</> : 'Mint Tokens →'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold">Token Launched!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your token is registered and minted. Use the Token ID when creating an auction.
              </p>
            </div>
            <CopyField label="Token ID" value={tokenId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
