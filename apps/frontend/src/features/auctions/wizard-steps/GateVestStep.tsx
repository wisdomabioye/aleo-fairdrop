import { useState } from 'react';
import { Input, Label, Switch, NativeSelect, NativeSelectOption, Button, Spinner } from '@/components';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { config } from '@/env';
import { parseExecutionError } from '@/shared/utils/errors';
import type { StepProps } from './types';

export function GateVestStep({ form, onChange }: StepProps) {
  const { executeTransaction } = useWallet();
  const [vestAuthStatus, setVestAuthStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [txError,        setTxError]        = useState<string | null>(null);

  async function handleVestAuth() {
    if (!form.saleTokenId) return;
    setTxError(null);
    setVestAuthStatus('loading');
    try {
      await executeTransaction({
        program:  SYSTEM_PROGRAMS.tokenRegistry,
        function: 'set_role',
        inputs:   [form.saleTokenId, config.programs.vest.programAddress, '3u8'],
        fee:      0.1,
      });
      setVestAuthStatus('done');
    } catch (err) {
      setTxError(parseExecutionError(err instanceof Error ? err.message : String(err)));
      setVestAuthStatus('idle');
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optionally restrict participation or enable vesting for token distribution.
      </p>

      {/* Gate mode */}
      <div className="space-y-1.5">
        <Label>Gate mode</Label>
        <NativeSelect
          value={String(form.gateMode)}
          onChange={(e) => onChange({ gateMode: parseInt(e.target.value) as 0 | 1 | 2 })}
        >
          <NativeSelectOption value="0">Open — anyone can bid</NativeSelectOption>
          <NativeSelectOption value="1">Merkle allowlist — proof required at bid</NativeSelectOption>
          <NativeSelectOption value="2">Credential — issuer-signed credential required</NativeSelectOption>
        </NativeSelect>
      </div>

      {form.gateMode === 1 && (
        <div className="space-y-1.5">
          <Label>Merkle root</Label>
          <Input
            value={form.merkleRoot === '0field' ? '' : form.merkleRoot}
            onChange={(e) => onChange({ merkleRoot: e.target.value || '0field' })}
            placeholder="BHP256 root field hex"
          />
          <p className="text-xs text-muted-foreground">
            Root of the allowlist Merkle tree. Bidders prove inclusion with a 20-element path at bid time.
          </p>
        </div>
      )}

      {form.gateMode === 2 && (
        <div className="space-y-1.5">
          <Label>Credential issuer address</Label>
          <Input
            value={form.issuerAddress}
            onChange={(e) => onChange({ issuerAddress: e.target.value })}
            placeholder="aleo1…"
          />
          <p className="text-xs text-muted-foreground">
            The address whose signature is required. Bidders present a credential + expiry block.
          </p>
        </div>
      )}

      {/* Vesting */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-medium">Enable vesting</p>
          <p className="text-xs text-muted-foreground">
            Tokens release linearly after a cliff rather than immediately at claim.
          </p>
        </div>
        <Switch
          checked={form.vestEnabled}
          onCheckedChange={(v) => onChange({ vestEnabled: v })}
        />
      </div>

      {form.vestEnabled && (
        <div className="rounded-md border border-border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cliff (blocks after end)</Label>
              <Input
                inputMode="numeric"
                value={form.vestCliffBlocks}
                onChange={(e) => onChange({ vestCliffBlocks: e.target.value.replace(/\D/g, '') })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">No tokens vest before this point.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Vest end (blocks after end)</Label>
              <Input
                inputMode="numeric"
                value={form.vestEndBlocks}
                onChange={(e) => onChange({ vestEndBlocks: e.target.value.replace(/\D/g, '') })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">100% vested at this block.</p>
            </div>
          </div>

          {vestAuthStatus !== 'done' ? (
            <div className="space-y-2">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                The vest program needs mint permission to release tokens to recipients.
              </p>
              <Button
                type="button"
                disabled={vestAuthStatus === 'loading' || !form.saleTokenId}
                onClick={handleVestAuth}
              >
                {vestAuthStatus === 'loading' ? (
                  <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
                ) : (
                  'Authorize Vest Program'
                )}
              </Button>
              {txError && <p className="text-xs text-destructive">{txError}</p>}
            </div>
          ) : (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Vest program is authorized
            </p>
          )}
        </div>
      )}
    </div>
  );
}
