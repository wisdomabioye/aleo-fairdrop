import type { Abi, AbiRecord } from '../runtime/abi';
import { programToClientName, toCamelCase } from './utils';
import { emitTransitionMethods } from './transitions';
import { emitMappingMethods } from './mappings';

export function emitClientInterface(abi: Abi): string {
  const clientName = programToClientName(abi.program);
  const lines: string[] = ['// ── Client interface ────────────────────────────────────────────────────────', ''];

  lines.push(`export interface ${clientName} {`);

  // Transitions
  if (abi.functions.length > 0) {
    lines.push('  // Transitions');
    for (const method of emitTransitionMethods(abi.functions)) {
      lines.push(method);
    }
  }

  // Mappings
  if (abi.mappings.length > 0) {
    lines.push('');
    lines.push('  // Mapping reads — pure HTTP, no WASM');
    for (const method of emitMappingMethods(abi.mappings)) {
      lines.push(method);
    }
  }

  // Record scanners
  if (abi.records.length > 0) {
    lines.push('');
    lines.push('  // Record scanners');
    lines.push('  records: {');
    for (const r of abi.records) {
      const name      = r.path[r.path.length - 1]!;
      const scannerFn = `scan${name}Records`;
      const camel     = name.charAt(0).toLowerCase() + name.slice(1) + 's';
      lines.push(`    /** Typed scanner for ${name} records from requestRecords(). */`);
      lines.push(`    ${camel}(entries: WalletRecord[]): ${name}Record[];`);
      // also emit the standalone scan function reference
      void scannerFn; // exported separately from records.ts
    }
    lines.push('  };');
  }

  lines.push('}', '');
  return lines.join('\n');
}

/** Derive which record scanner names map to records property keys */
export function recordScannerKeys(records: AbiRecord[]): { key: string; name: string }[] {
  return records.map(r => {
    const name = r.path[r.path.length - 1]!;
    return { key: name.charAt(0).toLowerCase() + name.slice(1) + 's', name };
  });
}

/** Emit the factory function that embeds the ABI and returns a typed client. */
export function emitFactory(abi: Abi): string {
  const clientName = programToClientName(abi.program);
  return [
    '// ── Factory ──────────────────────────────────────────────────────────────────',
    '',
    `export function create${clientName}(config?: ClientConfig): ${clientName} {`,
    `  return createAbigen(_abi, config ?? {}) as ${clientName};`,
    '}',
    '',
  ].join('\n');
}
