import { TypedEmitter } from 'tiny-typed-emitter';
import { DAFAULT_TIMEOUT_AFTER_REJECT, DEFAULT_OVERALL_TIMEOUT } from './common/constants';
import { TimeoutError } from './common/errors';
import { delay, promiseResult, promiseTimeout } from './common/util';
import { CleanupItem, RegistryEvents, RegistryOptions } from './common/interfaces';
import { AsyncFunc, RegisterOptions, RemoveItem } from './common/types';

export class CleanupRegistry extends TypedEmitter<RegistryEvents> {
  private registry: CleanupItem[] = [];
  private hasTriggered = false;
  private overallCleanupExpired = false;
  private overallCleanupExpireTimer: NodeJS.Timer | undefined;
  private readonly preCleanup?: AsyncFunc;
  private readonly postCleanup?: AsyncFunc;
  private readonly overallExpireCleanup: number;

  public constructor(registryOptions?: RegistryOptions) {
    super();
    this.preCleanup = registryOptions?.preCleanup;
    this.postCleanup = registryOptions?.postCleanup;
    this.overallExpireCleanup = registryOptions?.overallExpireCleanup ?? DEFAULT_OVERALL_TIMEOUT;
  }

  public register(registerItem: RegisterOptions): void {
    if (this.hasTriggered) {
      return;
    }

    const { func, id, timeout, timeoutAfterReject } = registerItem;

    const itemId = id !== undefined ? id : func.name;

    let itemTimeout = this.overallExpireCleanup;
    if (timeout !== undefined) {
      itemTimeout = timeout < this.overallExpireCleanup ? timeout : this.overallExpireCleanup;
    }

    let itemTimeoutAfterReject = DAFAULT_TIMEOUT_AFTER_REJECT;
    if (timeoutAfterReject !== undefined) {
      itemTimeoutAfterReject = timeoutAfterReject < this.overallExpireCleanup ? timeoutAfterReject : this.overallExpireCleanup;
    }

    this.registry.push({ func, id: itemId, timeout: itemTimeout, timeoutAfterReject: itemTimeoutAfterReject });
  }

  public remove(removeItem: RemoveItem): void {
    if (this.hasTriggered) {
      return;
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

  public async trigger(): Promise<void> {
    if (this.hasTriggered) {
      return;
    }

    this.hasTriggered = true;

    this.emit('started');

    this.initCleanupExpiredTimer();

    if (this.preCleanup) {
      await promiseResult(this.preCleanup());
    }

    await this.cleanup();

    if (this.postCleanup) {
      await promiseResult(this.postCleanup());
    }

    clearTimeout(this.overallCleanupExpireTimer);

    this.emit('finished', this.overallCleanupExpired ? 'timedout' : 'success');
  }

  public clear(): void {
    this.registry = [];
    this.hasTriggered = false;
    this.overallCleanupExpired = false;
    clearTimeout(this.overallCleanupExpireTimer);
  }

  private async cleanup(): Promise<void> {
    const cleanupPromises = this.registry.map(async (item) => {
      let error: Error | undefined;

      do {
        const timeoutFunction = promiseTimeout(item.func(), item.timeout);

        [error] = await promiseResult(timeoutFunction);

        if (error) {
          this.emit('itemFailed', item.id, error);
          const delayMs = error instanceof TimeoutError ? DAFAULT_TIMEOUT_AFTER_REJECT : item.timeoutAfterReject;
          await delay(delayMs);
        } else {
          this.emit('itemCompleted', item.id);
        }
      } while (error !== undefined && !this.overallCleanupExpired);
    });

    await Promise.allSettled(cleanupPromises);
  }

  private initCleanupExpiredTimer(): void {
    this.overallCleanupExpireTimer = setTimeout(() => {
      this.overallCleanupExpired = true;
    }, this.overallExpireCleanup);
  }
}
