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
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { asciiToU128 }     from '@fairdrop/sdk/parse';
import { generateTokenId } from '@fairdrop/sdk/registry';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { TX_DEFAULT_FEE }  from '@/env';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;
const NO_EXPIRY      = 4294967295; // u32::MAX

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
        const result = await executeTransaction({
          program:    TOKEN_REGISTRY,
          function:   'register_token',
          inputs:     [tokenId, `${nameU128}u128`, `${symbolU128}u128`, `${dec}u8`, `${maxRaw}u128`, 'false', address!],
          fee:        TX_DEFAULT_FEE,
          privateFee: false,
        });
        return result?.transactionId;
      },
    },
    {
      label:   'Mint Tokens',
      execute: async () => {
        const result = await executeTransaction({
          program:    TOKEN_REGISTRY,
          function:   'mint_private',
          inputs:     [tokenId, address!, `${mintRaw}u128`, 'false', `${NO_EXPIRY}u32`],
          fee:        TX_DEFAULT_FEE,
          privateFee: false,
        });
        return result?.transactionId;
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [address, tokenId, nameU128, symbolU128, dec, maxRaw, mintRaw]);

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
