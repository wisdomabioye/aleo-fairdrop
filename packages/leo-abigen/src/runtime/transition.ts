import type { TransactionOptions } from '@provablehq/aleo-types';
import type { AbiFunction, AbiInput, AbiStruct } from './abi';
import { serializeInput } from './dispatch';

export interface TxOptions {
  fee?:        number;
  privateFee?: boolean;
}

export interface TransitionHandle<A> {
  (args: A, opts?: TxOptions): Promise<string>;
  build(args: A, opts?: TxOptions): TransactionOptions;
}

type ExecFn = (spec: TransactionOptions) => Promise<{ transactionId: string } | undefined>;

export function createTransitionBuilder<A>(
  programId: string,
  fn:        AbiFunction,
  structs:   AbiStruct[],
  config:    { fee: number; privateFee: boolean; executeTransaction?: ExecFn },
): TransitionHandle<A> {
  const build = (args: A, opts?: TxOptions): TransactionOptions => ({
    program:    programId,
    function:   fn.name,
    // TransactionOptions.inputs is string[] — wallets accept record objects at runtime
    inputs:     serializeInputs(args as Record<string, unknown>, fn.inputs, structs) as string[],
    fee:        opts?.fee        ?? config.fee,
    privateFee: opts?.privateFee ?? config.privateFee,
  });

  const execute = async (args: A, opts?: TxOptions): Promise<string> => {
    if (!config.executeTransaction) {
      throw new Error(
        `[leo-abigen] ${fn.name}: executor mode requires 'executeTransaction' in ClientConfig. ` +
        `Use .build() to get a TransactionOptions spec and pass it to executeTransaction() yourself.`,
      );
    }
    const result = await config.executeTransaction(build(args, opts));
    if (!result) throw new Error(`[leo-abigen] ${fn.name}: executeTransaction returned undefined`);
    return result.transactionId;
  };

  (execute as TransitionHandle<A>).build = build;
  return execute as TransitionHandle<A>;
}

function serializeInputs(
  args:    Record<string, unknown>,
  inputs:  AbiInput[],
  structs: AbiStruct[],
): (string | Record<string, unknown>)[] {
  return inputs.map(inp => {
    if (inp.mode === 'None') {
      // Record input — pass through as string or Record<string,unknown>.
      // Wallets accept both at runtime.
      return args[inp.name] as string | Record<string, unknown>;
    }
    // Public input — inp.ty is { Plaintext: ... }; serializeInput unwraps it.
    return serializeInput(args[inp.name], inp.ty, structs);
  });
}
