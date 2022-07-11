import { BaseItem, CleanupItem } from './interfaces';

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type AsyncFunc<T = unknown> = () => Promise<T>;

export type ItemId = string | symbol;

export type RegisterOptions = Partial<CleanupItem> & Pick<CleanupItem, 'func'>;

export type RemoveItem = RequireAtLeastOne<BaseItem>;

export type FinishStatus = 'success' | 'timeout' | 'preFailed' | 'postFailed';
