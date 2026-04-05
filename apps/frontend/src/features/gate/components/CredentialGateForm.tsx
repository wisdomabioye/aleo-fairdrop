import { useState, useRef, useEffect }  from 'react';
import { useWallet }                    from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Textarea } from '@/components';
import { verifyCredential }             from '@fairdrop/sdk/transactions';
import { fetchGateConfig }              from '@fairdrop/sdk/chain';
import { parseExecutionError }          from '@/shared/utils/errors';
import { useConfirmedSequentialTx }     from '@/shared/hooks/useConfirmedSequentialTx';
import { ConnectWalletPrompt }          from '@/shared/components/wallet/ConnectWalletPrompt';

interface Props {
  auctionId:   string;
  onVerified?: () => void;
}

export function CredentialGateForm({ auctionId, onVerified }: Props) {
  const { connected, executeTransaction } = useWallet();

  const [issuer,     setIssuer]     = useState<string | null>(null);
  const [credJson,   setCredJson]   = useState('');
  const [parseError, setParseError] = useState('');
  const parsedRef = useRef<{ signature: string; expiry: number } | null>(null);

  useEffect(() => {
    fetchGateConfig(auctionId)
      .then((cfg) => setIssuer(cfg?.issuer ?? null))
      .catch(() => setIssuer(null));
  }, [auctionId]);

  const tx = useConfirmedSequentialTx([{
    label: 'Prove credential gate',
    execute: async () => {
      const parsed = parsedRef.current;
      if (!parsed) throw new Error('Credential not parsed');
      if (!issuer)  throw new Error('Issuer address not loaded');
      const spec   = verifyCredential(auctionId, issuer, parsed.signature, parsed.expiry);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }]);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your credential." />;
  }

  if (tx.done) {
    onVerified?.();
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Credential submitted. Waiting for confirmation…
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setParseError('');

    let raw: { signature: string; expiry: number };
    try {
      raw = JSON.parse(credJson);
      if (!raw.signature || typeof raw.expiry !== 'number') {
        throw new Error('Missing required fields: signature (string), expiry (number)');
      }
    } catch (err) {
      setParseError(`Invalid credential JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    parsedRef.current = { signature: raw.signature, expiry: raw.expiry };
    tx.advance();
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = parseError || (tx.error ? parseExecutionError(tx.error) : '');

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Credential Issuer</Label>
        {issuer === null ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Fetching issuer…
          </div>
        ) : (
          <Input value={issuer} readOnly className="font-mono text-xs" />
        )}
        <p className="text-xs text-muted-foreground">
          Only credentials signed by this address are accepted.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cred-json">Credential (JSON)</Label>
        <Textarea
          id="cred-json"
          rows={4}
          placeholder={'{\n  "signature": "sign1...",\n  "expiry": 1234567\n}'}
          value={credJson}
          onChange={(e) => setCredJson(e.target.value)}
          className="font-mono text-xs"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Provided by the auction creator — contains your signed credential and its expiry block.
        </p>
      </div>

      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

      <Button type="submit" className="w-full" disabled={busy || !credJson.trim() || !issuer}>
        {busy ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</> : 'Submit Credential'}
      </Button>
    </form>
  );
}
