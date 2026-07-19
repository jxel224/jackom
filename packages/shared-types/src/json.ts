/**
 * Every piece of state that lives in Redis or crosses the wire must be expressible as JsonValue.
 * This is what makes "no function-valued config" and "no arbitrary `unknown` to clients"
 * enforceable by the type system (ARCHITECTURE.md §13 issue #12, §13 issue #6).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
