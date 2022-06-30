import { AsyncFunc, ItemId, FinishStatus } from './types';

export interface RegistryOptions {
  preCleanup?: AsyncFunc;
  postCleanup?: AsyncFunc;
  overallTimeout?: number;
}

export interface TriggerOptions {
  shouldThrowIfPreErrors?: boolean;
  shouldThrowIfPostErrors?: boolean;
}

export interface CleanupItem {
  func: AsyncFunc;
  id: ItemId;
  timeout: number;
  timeoutAfterFailure: number;
}

export interface RegistryEvents {
  started: () => void;
  itemCompleted: (id: ItemId) => void;
  itemFailed: (id: ItemId, error: unknown, message?: string) => void;
  finished: (status: FinishStatus) => void;
}
