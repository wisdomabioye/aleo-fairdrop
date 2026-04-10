// Inner plaintext type — used in struct fields, record fields, mapping keys/values.
export type AleoPlaintext =
  | { Primitive: 'Field' | 'Address' | 'Boolean' }
  | { Primitive: { UInt: 'U8' | 'U16' | 'U32' | 'U64' | 'U128' } }
  | { Struct: { path: string[]; program: string } };

// Function input type — Public inputs wrap the plaintext type in { Plaintext: ... }.
// Record inputs use { Record: ... } directly (mode: "None").
export type AleoInputType =
  | { Plaintext: AleoPlaintext }
  | { Record: { path: string[]; program: string } }
  | 'Final';

export interface AbiField   { name: string; ty: AleoPlaintext; mode?: string; }
export interface AbiInput   { name: string; ty: AleoInputType; mode: 'Public' | 'None'; }
// Outputs have mode: "None" in the ABI but we don't use it — transitions are fire-and-forget.
export interface AbiOutput  { ty: AleoInputType; mode?: string; }
// Structs and records use path: string[] (e.g. ["AuctionConfig"]), NOT name: string.
export interface AbiStruct  { path: string[]; fields: AbiField[]; }
export interface AbiRecord  { path: string[]; fields: AbiField[]; }
export interface AbiMapping { name: string; key: AleoPlaintext; value: AleoPlaintext; }
export interface AbiFunction { name: string; is_final: boolean; inputs: AbiInput[]; outputs: AbiOutput[]; }
export interface Abi {
  program:            string;
  structs:            AbiStruct[];
  records:            AbiRecord[];
  mappings:           AbiMapping[];
  functions:          AbiFunction[];
  storage_variables?: unknown[];
}
