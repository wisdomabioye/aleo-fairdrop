/**
 * The single interface a creator implements to control access.
 *
 * Return true  → issue credential.
 * Return false → 403 Forbidden.
 * Throw        → 500 Internal Server Error.
 */
export type CheckFn = (address: string, auctionId: string) => Promise<boolean>;
