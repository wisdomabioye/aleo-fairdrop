import type { AbiFunction } from '../runtime/abi';
import { inputToTsType, toCamelCase, toPascalCase } from './utils';

export function emitTransitions(functions: AbiFunction[]): string {
  if (functions.length === 0) return '';
  const lines: string[] = ['// ── Transition arg types ────────────────────────────────────────────────────', ''];

  for (const fn of functions) {
    // Skip Final-only functions (pure finalize, no transition body)
    const realInputs = fn.inputs.filter(i => i.ty !== 'Final');
    if (realInputs.length === 0) continue;

    const argsName = `${toPascalCase(fn.name)}Args`;
    lines.push(`export interface ${argsName} {`);
    for (const inp of realInputs) {
      lines.push(`  ${inp.name}: ${inputToTsType(inp.ty)};`);
    }
    lines.push('}', '');
  }

  return lines.join('\n');
}

/** Emit the transitions block inside the client interface */
export function emitTransitionMethods(functions: AbiFunction[]): string[] {
  return functions
    .filter(fn => fn.inputs.some(i => i.ty !== 'Final'))
    .map(fn => {
      const camel    = toCamelCase(fn.name);
      const argsName = `${toPascalCase(fn.name)}Args`;
      return `  ${camel}: TransitionHandle<${argsName}>;`;
    });
}
