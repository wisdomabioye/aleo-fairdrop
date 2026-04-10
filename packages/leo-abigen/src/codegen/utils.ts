import type { AleoPlaintext, AleoInputType } from '../runtime/abi';

/** snake_case → camelCase */
export function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** snake_case → PascalCase */
export function toPascalCase(s: string): string {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** program id → client interface name: "fairswap_dex_v2.aleo" → "FairswapDexV2" */
export function programToClientName(programId: string): string {
  return toPascalCase(programId.replace(/\.aleo$/, ''));
}

/** AleoPlaintext → TypeScript type string */
export function plaintextToTsType(ty: AleoPlaintext): string {
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (p === 'Field')   return 'Field';
    if (p === 'Address') return 'Address';
    if (p === 'Boolean') return 'boolean';
    const uint = (p as { UInt: string }).UInt;
    if (uint === 'U128') return 'U128';
    if (uint === 'U64')  return 'U64';
    if (uint === 'U32')  return 'number';
    if (uint === 'U16')  return 'number';
    if (uint === 'U8')   return 'number';
  }
  if ('Struct' in ty) return ty.Struct.path[ty.Struct.path.length - 1]!;
  throw new Error(`[leo-abigen] cannot map type: ${JSON.stringify(ty)}`);
}

/** AleoInputType → TypeScript type string for Args interfaces */
export function inputToTsType(ty: AleoInputType): string {
  if (ty === 'Final') return 'never';
  if ('Plaintext' in ty) return plaintextToTsType(ty.Plaintext);
  if ('Record' in ty) return 'string | Record<string, unknown>';
  throw new Error(`[leo-abigen] cannot map input type: ${JSON.stringify(ty)}`);
}

/** Collect which branded scalar imports are needed */
export function collectPrimitiveImports(types: string[]): string[] {
  const branded = new Set<string>();
  for (const t of types) {
    if (t === 'Field' || t === 'Address' || t === 'U128' || t === 'U64') branded.add(t);
  }
  return [...branded].sort();
}
