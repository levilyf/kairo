/**
 * Generic id-keyed registry primitive.
 *
 * Lookup only: register, unregister, get, has, list.
 * No execution. No silent overrides. No global state.
 */

import {
  ContractError,
  ContractErrorCode,
  type ContractName,
} from "../contracts/errors.js";

export interface Identifiable {
  readonly id: string;
}

export class Registry<T extends Identifiable> {
  private readonly items = new Map<string, T>();

  constructor(
    private readonly contract: ContractName,
    private readonly assertItem: (value: unknown) => asserts value is T,
  ) {}

  register(item: T): void {
    this.assertItem(item);
    if (this.items.has(item.id)) {
      throw new ContractError({
        code: ContractErrorCode.DUPLICATE_ID,
        message: `Duplicate ${this.contract} id: "${item.id}"`,
        contract: this.contract,
        id: item.id,
      });
    }
    this.items.set(item.id, item);
  }

  unregister(id: string): boolean {
    return this.items.delete(id);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  list(): T[] {
    return [...this.items.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
