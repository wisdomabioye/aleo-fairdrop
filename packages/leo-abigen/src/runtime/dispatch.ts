import type { AleoPlaintext, AleoInputType, AbiStruct } from './abi';

// ── Serialization: TS value → Leo literal string ──────────────────────────────

export function serializeInput(
  value:   unknown,
  ty:      AleoInputType,
  structs: AbiStruct[],
): string {
  if (ty === 'Final') throw new Error('[leo-abigen] cannot serialize Final type');
  // Unwrap Plaintext wrapper — present on mode:"Public" function inputs.
  // Struct fields and record fields do NOT have this wrapper.
  if ('Plaintext' in ty) return serializePlaintext(value, ty.Plaintext, structs);
  if ('Record' in ty) throw new Error('[leo-abigen] record inputs pass through as-is; do not call serializeInput on them');
  throw new Error(`[leo-abigen] cannot serialize: ${JSON.stringify(ty)}`);
}

function serializePlaintext(
  value:   unknown,
  ty:      AleoPlaintext,
  structs: AbiStruct[],
): string {
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (typeof p === 'object') {
      if (p.UInt === 'U128') return `${value}u128`;
      if (p.UInt === 'U64')  return `${value}u64`;
      if (p.UInt === 'U32')  return `${value}u32`;
      if (p.UInt === 'U16')  return `${value}u16`;
      return `${value}u8`;
    }
    if (p === 'Boolean')   return String(Boolean(value));
    if (p === 'Address')   return String(value);
    if (p === 'Signature') return String(value);
    if (p === 'Field')     return ensureFieldSuffix(String(value));
  }
  if ('Array' in ty) {
    const arr = value as unknown[];
    const items = arr.map(v => serializePlaintext(v, ty.Array.element, structs));
    return `[${items.join(', ')}]`;
  }
  if ('Struct' in ty) {
    const def = resolveStruct(ty.Struct.path, structs);
    const obj = value as Record<string, unknown>;
    const body = def.fields
      .map(f => `${f.name}: ${serializePlaintext(obj[f.name], f.ty, structs)}`)
      .join(', ');
    return `{ ${body} }`;
  }
  throw new Error(`[leo-abigen] cannot serialize: ${JSON.stringify(ty)}`);
}

// ── Deserialization: Leo literal string → TS value ────────────────────────────

// Deserializes mapping values and struct fields — these never have the Plaintext wrapper.
export function deserializeOutput(
  raw:     string,
  ty:      AleoPlaintext,
  structs: AbiStruct[],
): unknown {
  const s = stripVis(raw.trim());
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (p === 'Boolean')   return s === 'true';
    if (p === 'Address')   return s;
    if (p === 'Signature') return s;
    if (p === 'Field')     return stripSuffix(s);
    const uint = (p as { UInt: string }).UInt;
    if (uint === 'U128' || uint === 'U64') return stripSuffix(s);
    return parseInt(stripSuffix(s), 10);
  }
  if ('Array' in ty) {
    return parseArrayLiteral(s).map(item => deserializeOutput(item, ty.Array.element, structs));
  }
  if ('Struct' in ty) {
    const def   = resolveStruct(ty.Struct.path, structs);
    const pairs = parseStruct(s);
    const result: Record<string, unknown> = {};
    for (const f of def.fields) {
      result[f.name] = deserializeOutput(pairs[f.name] ?? '', f.ty, structs);
    }
    return result;
  }
  return s;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ensureFieldSuffix(v: string): string {
  return v.endsWith('field') ? v : `${v}field`;
}

function stripSuffix(raw: string): string {
  return raw.replace(/(?:u\d+|i\d+|field|group|bool|scalar)$/, '').trim();
}

function stripVis(raw: string): string {
  return raw.replace(/\.(private|public)$/, '');
}

function resolveStruct(path: string[], structs: AbiStruct[]): AbiStruct {
  const name = path[path.length - 1]!;
  const def  = structs.find(s => s.path[s.path.length - 1] === name);
  if (!def) throw new Error(`[leo-abigen] unknown struct: ${name}`);
  return def;
}

/** Parse a Leo array literal "[a, b, c]" into element strings (bracket-depth-aware). */
function parseArrayLiteral(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  const items: string[] = [];
  let depth = 0, current = '';
  for (const ch of inner) {
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { items.push(current.trim()); current = ''; }
    else current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

/**
 * Parse a Leo struct literal into a flat string map.
 * Handles nested braces correctly.
 * e.g. "{ a: 1u64, b: { x: 2u8 } }" → { a: '1u64', b: '{ x: 2u8 }' }
 * Exported so records.ts can reuse it for record plaintext parsing.
 */
export function parseStruct(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error(`[leo-abigen] expected struct literal, got: "${trimmed.slice(0, 60)}"`);
  }
  const inner = trimmed.slice(1, -1).trim();
  const result: Record<string, string> = {};
  let depth = 0, key = '', value = '', inKey = true;
  for (const ch of inner) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (inKey) {
      if (ch === ':') { inKey = false; value = ''; }
      else key += ch;
    } else {
      if (ch === ',' && depth === 0) {
        result[key.trim()] = value.trim();
        key = ''; value = ''; inKey = true;
      } else {
        value += ch;
      }
    }
  }
  if (key.trim()) result[key.trim()] = value.trim();
  return result;
}
