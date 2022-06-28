import { AsyncFunc, ItemId, FinishStatus } from './types';

export interface RegistryOptions {
  preCleanup?: AsyncFunc;
  postCleanup?: AsyncFunc;
  overallExpireCleanup?: number;
}

export interface CleanupItem {
  func: AsyncFunc;
  id: ItemId;
  timeout: number;
  timeoutAfterReject: number;
}

export interface RegistryEvents {
  started: () => void;
  itemCompleted: (id: ItemId) => void;
  itemFailed: (id: ItemId, error: unknown, message?: string) => void;
  finished: (status: FinishStatus) => void;
}
