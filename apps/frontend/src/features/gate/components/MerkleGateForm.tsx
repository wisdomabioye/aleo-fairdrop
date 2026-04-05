import { useState, useRef }           from 'react';
import { useWallet }                   from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Label, Spinner, Textarea } from '@/components';
import { verifyMerkle }                from '@fairdrop/sdk/transactions';
import { parseExecutionError }         from '@/shared/utils/errors';
import { useConfirmedSequentialTx }    from '@/shared/hooks/useConfirmedSequentialTx';
import { ConnectWalletPrompt }         from '@/shared/components/wallet/ConnectWalletPrompt';

interface Props {
  auctionId:   string;
  onVerified?: () => void;
}

export function MerkleGateForm({ auctionId, onVerified }: Props) {
  const { connected, executeTransaction } = useWallet();

  const [proofJson,  setProofJson]  = useState('');
  const [parseError, setParseError] = useState('');
  const parsedRef = useRef<{ siblings: string[]; pathBits: number } | null>(null);

  const tx = useConfirmedSequentialTx([{
    label: 'Prove Merkle gate',
    execute: async () => {
      const parsed = parsedRef.current;
      if (!parsed) throw new Error('Proof not parsed');
      const spec   = verifyMerkle(auctionId, parsed.siblings, parsed.pathBits);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }]);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your Merkle proof." />;
  }

  if (tx.done) {
    onVerified?.();
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Proof submitted. Waiting for confirmation…
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setParseError('');

    let raw: { siblings: string[]; pathBits?: number; path_bits?: (string | boolean)[] };
    try {
      raw = JSON.parse(proofJson);
      if (!Array.isArray(raw.siblings)) {
        throw new Error('Missing required field: siblings');
      }
      if (raw.siblings.length !== 20) {
        throw new Error(`siblings must have exactly 20 elements (got ${raw.siblings.length})`);
      }
      if (typeof raw.pathBits !== 'number' && !Array.isArray(raw.path_bits)) {
        throw new Error('Missing required field: pathBits (number) or path_bits (array)');
      }
    } catch (err) {
      setParseError(`Invalid proof JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const pathBits: number = typeof raw.pathBits === 'number'
      ? raw.pathBits
      : (raw.path_bits ?? []).reduce(
          (acc: number, bit: string | boolean, i: number) =>
            (bit === true || bit === 'true') ? acc | (1 << i) : acc,
          0,
        );

    parsedRef.current = { siblings: raw.siblings, pathBits };
    tx.advance();
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = parseError || (tx.error ? parseExecutionError(tx.error) : '');

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="merkle-proof">Merkle Proof (JSON)</Label>
        <Textarea
          id="merkle-proof"
          rows={6}
          placeholder={'{\n  "siblings": ["0field", "123...field", ...],\n  "pathBits": 42\n}'}
          value={proofJson}
          onChange={(e) => setProofJson(e.target.value)}
          className="font-mono text-xs"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Your entry from the proofs.json distributed by the auction creator.
        </p>
      </div>

      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

      <Button type="submit" className="w-full" disabled={busy || !proofJson.trim()}>
        {busy ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</> : 'Submit Proof'}
      </Button>
    </form>
  );
}
