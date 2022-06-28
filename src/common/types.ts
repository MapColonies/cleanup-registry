import { CleanupItem } from './interfaces';

export type AsyncFunc<T = unknown> = () => Promise<T>;

export type ItemId = string | symbol;

export type RegisterOptions = Partial<CleanupItem> & {
  func: AsyncFunc;
};

export type RemoveItem = {
  func?: AsyncFunc;
  id?: ItemId;
} & (
  | {
      func: AsyncFunc;
    }
  | {
      id: ItemId;
    }
);

export type FinishStatus = 'success' | 'timedout';