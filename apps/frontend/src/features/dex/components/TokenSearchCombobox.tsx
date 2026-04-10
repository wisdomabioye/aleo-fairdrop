import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  Button,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useTokenRecords } from '@/shared/hooks/useTokenRecords';
import { useTokenSearch } from '../hooks/useTokenSearch';
import { useVerifiedTokens } from '../hooks/useVerifiedTokens';
import { useTokenInfo } from '@/shared/hooks/useTokenInfo';
import { TokenChip } from './TokenChip';
import type { TokenDisplay } from '@/config/well-known-tokens';

interface TokenSearchComboboxProps {
  token:     TokenDisplay | null;
  onChange:  (token: TokenDisplay) => void;
  exclude?:  string | null;
  label?:    string;
  disabled?: boolean;
}

/** Regex to detect a raw field ID like "123field". */
const FIELD_ID_RE = /^\d+field$/;

export function TokenSearchCombobox({
  token,
  onChange,
  exclude,
  label = 'Select token',
  disabled,
}: TokenSearchComboboxProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');

  const { connected } = useWallet();
  const { tokenRecords } = useTokenRecords();
  const { data: verified } = useVerifiedTokens();
  const { data: searchResults } = useTokenSearch(query);

  // Field ID escape hatch — resolve on selection
  const isFieldQuery = FIELD_ID_RE.test(query.trim());
  const { data: fieldLookup } = useTokenInfo(isFieldQuery ? query.trim() : undefined);

  // Deduplicate wallet token records by token_id, only unspent
  const walletTokens = connected
    ? Array.from(
        tokenRecords
          .filter((r) => !r.spent && r.token_id !== exclude)
          .reduce((map, r) => {
            if (!map.has(r.token_id)) map.set(r.token_id, r);
            return map;
          }, new Map<string, typeof tokenRecords[number]>())
          .values(),
      )
    : [];

  const filteredVerified = (verified ?? []).filter((t) => t.tokenId !== exclude);
  const filteredSearch   = (searchResults?.items ?? []).filter((t) => t.tokenId !== exclude);

  function select(t: TokenDisplay) {
    onChange(t);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className="h-9 w-full justify-between border-border/70 bg-background/50 px-3 text-xs"
        >
          <TokenChip token={token} size="sm" />
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search tokens or paste field ID…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>No tokens found.</CommandEmpty>

            {walletTokens.length > 0 && (
              <CommandGroup heading="Your Tokens">
                {walletTokens.map((r) => (
                  <WalletTokenItem
                    key={r.token_id}
                    tokenId={r.token_id}
                    onSelect={select}
                  />
                ))}
              </CommandGroup>
            )}

            {filteredVerified.length > 0 && (
              <CommandGroup heading="Popular">
                {filteredVerified.map((t) => (
                  <CommandItem
                    key={t.tokenId}
                    value={t.tokenId}
                    onSelect={() => select(t)}
                  >
                    <TokenChip token={t} size="sm" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {filteredSearch.length > 0 && (
              <CommandGroup heading="Results">
                {filteredSearch.map((t) => (
                  <CommandItem
                    key={t.tokenId}
                    value={t.tokenId}
                    onSelect={() => select(t)}
                  >
                    <TokenChip token={t} size="sm" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {isFieldQuery && fieldLookup && fieldLookup.tokenId !== exclude && (
              <CommandGroup heading="Field ID Lookup">
                <CommandItem
                  value={fieldLookup.tokenId}
                  onSelect={() => select(fieldLookup)}
                >
                  <TokenChip token={fieldLookup} size="sm" />
                </CommandItem>
              </CommandGroup>
            )}

            {isFieldQuery && !fieldLookup && (
              <CommandGroup heading="Field ID Lookup">
                <CommandItem disabled>
                  <span className="text-muted-foreground">Looking up {query.trim()}…</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders a wallet token record — resolves metadata via useTokenInfo.
 * Falls back to truncated token_id if metadata hasn't loaded yet.
 */
function WalletTokenItem({
  tokenId,
  onSelect,
}: {
  tokenId:  string;
  onSelect: (t: TokenDisplay) => void;
}) {
  const { data: meta, isLoading } = useTokenInfo(tokenId);

  const display: TokenDisplay | null = meta ?? null;

  return (
    <CommandItem
      value={tokenId}
      onSelect={() => {
        if (display) onSelect(display);
      }}
      disabled={!display}
    >
      {isLoading ? (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ) : display ? (
        <TokenChip token={display} size="sm" />
      ) : (
        <span className="truncate font-mono text-xs text-muted-foreground">{tokenId}</span>
      )}
    </CommandItem>
  );
}
