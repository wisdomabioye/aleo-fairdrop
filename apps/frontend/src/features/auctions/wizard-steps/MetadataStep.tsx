import { useState } from 'react';
import { Input, Label, Textarea, Button } from '@/components';
import { metadataService } from '@/services/metadata.service';
import type { StepProps } from './types';

export function MetadataStep({ form, onChange }: StepProps) {
  const [logoFile,    setLogoFile]    = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isSaved = !!form.metadataHash && form.metadataHash !== '0field';

  /** Any field change invalidates the saved hash — user must re-save. */
  function invalidate(updates: Partial<typeof form>) {
    onChange({ ...updates, metadataHash: '0field', metadataIpfsCid: '' });
  }

  async function handleSave() {
    if (!form.metadataName.trim() || !form.metadataDescription.trim()) return;
    setUploadError(null);
    setUploading(true);
    try {
      let logoIpfs = form.metadataLogoIpfs;
      if (logoFile) {
        const cid = await metadataService.uploadLogo(logoFile);
        if (cid) {
          logoIpfs = cid;
          onChange({ metadataLogoIpfs: cid });
        }
      }
      const result = await metadataService.upload({
        name:        form.metadataName.trim(),
        description: form.metadataDescription.trim(),
        website:     form.metadataWebsite.trim()  || undefined,
        twitter:     form.metadataTwitter.trim()  || undefined,
        discord:     form.metadataDiscord.trim()  || undefined,
        logoIpfs:    logoIpfs                     || undefined,
      });
      onChange({
        metadataHash:        result.hash,
        metadataIpfsCid:     result.ipfsCid,
        metadataLogoIpfs:    logoIpfs,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Metadata is pinned to IPFS and its hash committed on-chain.
        Name and description are required.
      </p>

      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.metadataName}
          onChange={(e) => invalidate({ metadataName: e.target.value })}
          placeholder="My Token Auction"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Textarea
          value={form.metadataDescription}
          onChange={(e) => invalidate({ metadataDescription: e.target.value })}
          placeholder="A brief description of the auction and its goals…"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Logo image (optional)</Label>
        <input
          type="file"
          accept="image/*"
          className="text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
          onChange={(e) => {
            setLogoFile(e.target.files?.[0] ?? null);
            invalidate({});
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input
            value={form.metadataWebsite}
            onChange={(e) => invalidate({ metadataWebsite: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Twitter</Label>
          <Input
            value={form.metadataTwitter}
            onChange={(e) => invalidate({ metadataTwitter: e.target.value })}
            placeholder="@handle"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Discord</Label>
          <Input
            value={form.metadataDiscord}
            onChange={(e) => invalidate({ metadataDiscord: e.target.value })}
            placeholder="discord.gg/…"
          />
        </div>
      </div>

      <Button
        type="button"
        disabled={!form.metadataName.trim() || !form.metadataDescription.trim() || uploading || isSaved}
        onClick={handleSave}
      >
        {uploading ? 'Saving to IPFS…' : isSaved ? '✓ Metadata saved' : 'Save Metadata to IPFS'}
      </Button>

      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

      {isSaved && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="text-muted-foreground">
            IPFS CID:{' '}
            <span className="font-mono break-all">{form.metadataIpfsCid}</span>
          </div>
          <div className="text-muted-foreground">
            On-chain hash:{' '}
            <span className="font-mono break-all">{form.metadataHash}</span>
          </div>
        </div>
      )}
    </div>
  );
}
