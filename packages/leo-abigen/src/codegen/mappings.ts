import type { AbiMapping } from '../runtime/abi';
import { plaintextToTsType, toCamelCase } from './utils';

export function emitMappingMethods(mappings: AbiMapping[]): string[] {
  return mappings.map(m => {
    const camel     = toCamelCase(m.name);
    const valueType = plaintextToTsType(m.value);
    return `  ${camel}(key: string): Promise<${valueType} | null>;`;
  });
}
