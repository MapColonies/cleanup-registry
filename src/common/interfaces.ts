import { AsyncFunc, ItemId, FinishStatus } from './types';

export interface LogFn {
  (obj: unknown, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}

export interface ILogger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal?: LogFn;
}

export interface RegistryOptions {
  preCleanupHook?: AsyncFunc;
  postCleanupHook?: AsyncFunc;
  overallTimeout?: number;
  logger?: ILogger;
}

export interface TriggerOptions {
  ignorePreError?: boolean;
  ignorePostError?: boolean;
}

export interface BaseItem {
  func: AsyncFunc;
  id: ItemId;
}

export interface CleanupItem extends BaseItem {
  timeout: number;
  timeoutAfterFailure: number;
}

export interface RegistryEvents {
  started: () => void;
  itemCompleted: (id: ItemId) => void;
  itemFailed: (id: ItemId, error: unknown, message?: string) => void;
  finished: (status: FinishStatus) => void;
}
