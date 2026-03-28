import { useState } from 'react';
import { Input, Label, Textarea, Spinner } from '@/components';
import { metadataService } from '@/services/metadata.service';
import type { StepProps } from './types';

export function MetadataStep({ form, onChange }: StepProps) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError,     setLogoError]     = useState<string | null>(null);

  const hasLogo = !!form.metadataLogoIpfs;

  async function handleLogoUpload(file: File) {
    setLogoError(null);
    setLogoUploading(true);
    try {
      const cid = await metadataService.uploadLogo(file);
      if (cid) {
        onChange({ metadataLogoIpfs: cid });
      } else {
        setLogoError('Logo upload failed. You can still proceed without it.');
      }
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Metadata will be pinned to IPFS when you submit the auction.
        Name and description are required.
      </p>

      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.metadataName}
          onChange={(e) => onChange({ metadataName: e.target.value })}
          placeholder="My Token Auction"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Textarea
          value={form.metadataDescription}
          onChange={(e) => onChange({ metadataDescription: e.target.value })}
          placeholder="A brief description of the auction and its goals…"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Logo image (optional)</Label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="image/*"
            className="text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file) handleLogoUpload(file);
            }}
          />
          {logoUploading && <Spinner className="h-4 w-4" />}
          {hasLogo && !logoUploading && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Uploaded</span>
          )}
        </div>
        {logoError && <p className="text-xs text-destructive">{logoError}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input
            value={form.metadataWebsite}
            onChange={(e) => onChange({ metadataWebsite: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Twitter</Label>
          <Input
            value={form.metadataTwitter}
            onChange={(e) => onChange({ metadataTwitter: e.target.value })}
            placeholder="@handle"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Discord</Label>
          <Input
            value={form.metadataDiscord}
            onChange={(e) => onChange({ metadataDiscord: e.target.value })}
            placeholder="discord.gg/…"
          />
        </div>
      </div>
    </div>
  );
}
