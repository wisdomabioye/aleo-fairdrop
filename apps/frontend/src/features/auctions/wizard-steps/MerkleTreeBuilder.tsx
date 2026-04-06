import { useState }             from 'react';
import { Button, Label, Spinner, Textarea } from '@/components';
import { useMerkleBuilder }      from '@/shared/hooks/useMerkleBuilder';
import type { MerkleWorkerResponse } from '@/workers/merkle-builder.worker';

interface Props {
  onRootComputed: (root: string) => void;
}

export function MerkleTreeBuilder({ onRootComputed }: Props) {
  const { build, building, error, clearError } = useMerkleBuilder();
  const [addressText,  setAddressText]  = useState('');
  const [proofBundle,  setProofBundle]  = useState<MerkleWorkerResponse | null>(null);

  function handleBuild() {
    const addresses = addressText
      .split(/[\n,]+/)
      .map((a) => a.trim())
      .filter((a) => a.startsWith('aleo1'));

    if (addresses.length === 0) return;

    build(addresses, (result) => {
      setProofBundle(result);
      onRootComputed(result.root);
    });
  }

  function downloadProofs() {
    if (!proofBundle) return;
    const blob = new Blob(
      [JSON.stringify(proofBundle.proofs, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'merkle-proofs.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Allowlist addresses</Label>
        <Textarea
          rows={6}
          placeholder={'aleo1abc...\naleo1def...'}
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          className="font-mono text-xs"
          disabled={building}
        />
        <p className="text-xs text-muted-foreground">
          One address per line or comma-separated. Order determines leaf index.
        </p>
      </div>

      <Button
        type="button"
        onClick={handleBuild}
        disabled={building || !addressText.trim()}
      >
        {building
          ? <><Spinner className="mr-2 size-4" />Computing tree…</>
          : 'Build Merkle Tree'}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {proofBundle && (
        <div className="space-y-2">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
            <p className="text-emerald-400 font-medium">Tree built</p>
            <p className="font-mono text-muted-foreground break-all mt-0.5">{proofBundle.root}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadProofs}>
              Download proofs.json
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setProofBundle(null); setAddressText(''); clearError(); }}
            >
              Clear & rebuild
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Distribute each address's entry from proofs.json to your allowlisted bidders.
          </p>
        </div>
      )}
    </div>
  );
}
