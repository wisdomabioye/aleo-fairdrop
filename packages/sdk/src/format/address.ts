/** Shorten a bech32 address for display: "aleo1abc...xyz". */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Strip `field` suffix and truncate long field elements for display. */
export function formatField(field: string): string {
  const val = field.endsWith('field') ? field.slice(0, -5) : field;
  if (val.length > 16) return `${val.slice(0, 8)}...${val.slice(-6)}`;
  return val;
}
