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

/** program id → client interface name: "fairswap_dex_v3.aleo" → "FairswapDexV2" */
export function programToClientName(programId: string): string {
  return toPascalCase(programId.replace(/\.aleo$/, ''));
}

/** AleoPlaintext → TypeScript type string */
export function plaintextToTsType(ty: AleoPlaintext): string {
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (typeof p === 'object') {
      if (p.UInt === 'U128') return 'U128';
      if (p.UInt === 'U64')  return 'U64';
      return 'number'; // U32, U16, U8
    }
    if (p === 'Field')     return 'Field';
    if (p === 'Address')   return 'Address';
    if (p === 'Boolean')   return 'boolean';
    if (p === 'Signature') return 'string';
  }
  if ('Array'  in ty) return `${plaintextToTsType(ty.Array.element)}[]`;
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
    // Strip trailing [] to handle array types like 'Field[]'
    const base = t.replace(/\[\]+$/, '');
    if (base === 'Field' || base === 'Address' || base === 'U128' || base === 'U64') branded.add(base);
  }
  return [...branded].sort();
}
