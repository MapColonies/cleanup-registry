import { TypedEmitter } from 'tiny-typed-emitter';
import { nanoid } from 'nanoid';
import { DEFAULT_TIMEOUT_AFTER_FAILURE, DEFAULT_OVERALL_TIMEOUT, DEFAULT_TRIGGER_OPTIONS } from './common/constants';
import { AlreadyTriggeredError, RegisterError, TimeoutError } from './common/errors';
import { delay, promiseResult, promiseTimeout } from './common/util';
import { CleanupItem, RegistryEvents, RegistryOptions, TriggerOptions } from './common/interfaces';
import { AsyncFunc, FinishStatus, ItemId, RegisterOptions, RemoveItem } from './common/types';

export class CleanupRegistry extends TypedEmitter<RegistryEvents> {
  public hasTriggered = false;
  private readonly preCleanup?: AsyncFunc;
  private readonly postCleanup?: AsyncFunc;
  private readonly overallTimeout: number;

  private registry: CleanupItem[] = [];
  private overallExpired = false;
  private overallExpireTimer: NodeJS.Timer | undefined;

  public constructor(registryOptions?: RegistryOptions) {
    super();
    this.preCleanup = registryOptions?.preCleanup;
    this.postCleanup = registryOptions?.postCleanup;
    this.overallTimeout = registryOptions?.overallTimeout ?? DEFAULT_OVERALL_TIMEOUT;
  }

  public register(options: RegisterOptions): ItemId {
    if (this.hasTriggered) {
      throw new AlreadyTriggeredError();
    }

    const { func, id, timeout, timeoutAfterFailure } = options;

    const itemId = id !== undefined ? id : nanoid();

    let itemTimeout = this.overallTimeout;
    if (timeout !== undefined) {
      if (timeout > this.overallTimeout) {
        throw new RegisterError(`given item timeout ${timeout} is greater than overall cleanup registry timeout ${this.overallTimeout}`);
      }
      itemTimeout = timeout;
    }

    let itemTimeoutAfterFailure = DEFAULT_TIMEOUT_AFTER_FAILURE;
    if (timeoutAfterFailure !== undefined) {
      if (timeoutAfterFailure > this.overallTimeout) {
        throw new RegisterError(
          `given item timeoutAfterFailure ${timeoutAfterFailure} is greater than overall cleanup registry timeout ${this.overallTimeout}`
        );
      }
      itemTimeoutAfterFailure = timeoutAfterFailure;
    }

    this.registry.push({ func, id: itemId, timeout: itemTimeout, timeoutAfterFailure: itemTimeoutAfterFailure });

    return itemId;
  }

  public remove(removeItem: RemoveItem): void {
    if (this.hasTriggered) {
      throw new AlreadyTriggeredError();
    }

    const { func: funcForRemoval, id: funcIdForRemoval } = removeItem;

    const filtered = this.registry.filter((item) => {
      if (funcForRemoval !== undefined && funcIdForRemoval !== undefined) {
        return item.func !== funcForRemoval || item.id !== funcIdForRemoval;
      } else if (funcForRemoval !== undefined) {
        return item.func !== funcForRemoval;
      }
      return item.id !== funcIdForRemoval;
    });

    this.registry = filtered;
  }

  public async trigger(triggerOptions: TriggerOptions = DEFAULT_TRIGGER_OPTIONS): Promise<void> {
    if (this.hasTriggered) {
      throw new AlreadyTriggeredError();
    }

    const { ignorePreError, ignorePostError } = triggerOptions;
    this.hasTriggered = true;

    this.emit('started');

    this.initCleanupExpiredTimer();

    if (this.preCleanup) {
      const [preErr] = await promiseResult(this.preCleanup());
      if (preErr !== undefined && ignorePreError === false) {
        this.finish('preFailed');
        throw preErr;
      }
    }

    await this.cleanup();

    if (this.postCleanup) {
      const [postErr] = await promiseResult(this.postCleanup());
      if (postErr !== undefined && ignorePostError === false) {
        this.finish('postFailed');
        throw postErr;
      }
    }

    this.finish(this.overallExpired ? 'timedout' : 'success');
  }

  public clear(): void {
    this.registry = [];
    this.hasTriggered = false;
    this.overallExpired = false;
    clearTimeout(this.overallExpireTimer);
  }

  private finish(status: FinishStatus): void {
    clearTimeout(this.overallExpireTimer);
    this.emit('finished', status);
  }

  private async cleanup(): Promise<void> {
    const cleanupPromises = this.registry.map(async (item) => {
      let itemCompleted = false;

      while (!itemCompleted && !this.overallExpired) {
        const timeoutFunction = promiseTimeout(item.func(), item.timeout);

        const [error] = await promiseResult(timeoutFunction);

        if (error !== undefined) {
          this.emit('itemFailed', item.id, error);
          if (!(error instanceof TimeoutError)) {
            await delay(item.timeoutAfterFailure);
          }
        } else {
          itemCompleted = true;
          this.emit('itemCompleted', item.id);
        }
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  private initCleanupExpiredTimer(): void {
    this.overallExpireTimer = setTimeout(() => {
      this.overallExpired = true;
    }, this.overallTimeout);
  }
}
