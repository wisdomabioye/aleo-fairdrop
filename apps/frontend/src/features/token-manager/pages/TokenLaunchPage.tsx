/**
 * Token Launch — 2-step wizard to register and mint a new ARC-20 token.
 *
 * Step 1: register_token on token_registry.aleo
 * Step 2: mint_private the initial supply to the creator's wallet
 *
 * Each step waits for on-chain confirmation before advancing.
 */
import { useState, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { PageHeader } from '@/components';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { StepIndicator }  from '@/shared/components/StepIndicator';
// import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import {
  RegisterTokenForm,
  MintTokenForm,
  TokenLaunchSuccess,
} from '@/features/token-manager/components';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { registerToken, mintPrivate, mintPublic } from '@fairdrop/sdk/token-registry';
import { asciiToU128 }     from '@fairdrop/sdk/parse';
import { generateTokenId } from '@fairdrop/sdk/hash';
import { parseTokenAmount } from '@fairdrop/sdk/format';

// ── TokenLaunchPage ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Register', 'Mint'];

export function TokenLaunchPage() {
  const { address, connected, executeTransaction } = useWallet();

  const [tokenId] = useState(generateTokenId);

  // ── Step 1 form state ────────────────────────────────────────────────────
  const [name,      setName]      = useState('');
  const [symbol,    setSymbol]    = useState('');
  const [decimals,  setDecimals]  = useState('6');
  const [maxSupply, setMaxSupply] = useState('');

  // ── Step 2 form state ────────────────────────────────────────────────────
  const [mintAmount, setMintAmount] = useState('');
  const [mintMode,   setMintMode]   = useState<'private' | 'public'>('private');

  // ── Derived / validation ─────────────────────────────────────────────────
  const dec    = parseInt(decimals, 10);
  const maxRaw = parseTokenAmount(maxSupply, isNaN(dec) ? 0 : dec);
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

  // ── Field change handler ──────────────────────────────────────────────────
  function handleStep1Change(field: 'name' | 'symbol' | 'decimals' | 'maxSupply', value: string) {
    if (field === 'name')      setName(value);
    if (field === 'symbol')    setSymbol(value);
    if (field === 'decimals')  setDecimals(value);
    if (field === 'maxSupply') setMaxSupply(value);
  }

  // ── Sequential tx steps ───────────────────────────────────────────────────
  const steps = useMemo(() => [
    {
      label:   'Register Token',
      execute: async () => {
        const spec   = registerToken(tokenId, nameU128!, symbolU128!, dec, maxRaw, address!);
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
    {
      label:   mintMode === 'private' ? 'Mint Tokens (Private)' : 'Mint Tokens (Public)',
      execute: async () => {
        const spec = mintMode === 'private'
          ? mintPrivate(tokenId, address!, mintRaw)
          : mintPublic(tokenId, address!, mintRaw);
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [address, tokenId, nameU128, symbolU128, dec, maxRaw, mintRaw, mintMode]);

  const { currentStep, done, busy, isWaiting, error, /* trackedIds, */ advance } =
    useConfirmedSequentialTx(steps);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <PageHeader title="Token Launch" description="Register and mint a new ARC-20 token on Aleo." />
        <ConnectWalletPrompt message="Connect your wallet to launch a token." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <PageHeader title="Token Launch" description="Register and mint a new ARC-20 token on Aleo." />

      <StepIndicator steps={STEP_LABELS} currentStep={currentStep} done={done} />

      {!done && currentStep === 0 && (
        <RegisterTokenForm
          tokenId={tokenId}
          name={name} symbol={symbol} decimals={decimals} maxSupply={maxSupply}
          dec={dec} maxRaw={maxRaw}
          nameU128={nameU128} symbolU128={symbolU128}
          nameError={nameError} symbolError={symbolError}
          isValid={step1Valid}
          busy={busy} isWaiting={isWaiting} error={error}
          onChange={handleStep1Change}
          onSubmit={advance}
        />
      )}

      {!done && currentStep === 1 && (
        <MintTokenForm
          symbol={symbol} decimals={isNaN(dec) ? 0 : dec} maxRaw={maxRaw}
          mintAmount={mintAmount} mintRaw={mintRaw}
          isValid={step2Valid}
          mintMode={mintMode} onModeChange={setMintMode}
          busy={busy} isWaiting={isWaiting} error={error}
          onChange={setMintAmount}
          onSubmit={advance}
        />
      )}

      {done && <TokenLaunchSuccess tokenId={tokenId} />}

      {/* <WizardTxStatus trackedIds={trackedIds} /> */}
    </div>
  );
}
