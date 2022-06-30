import { TypedEmitter } from 'tiny-typed-emitter';
import { DAFAULT_TIMEOUT_AFTER_FAILURE, DEFAULT_OVERALL_TIMEOUT, DEFAULT_TRIGGER_OPTIONS } from './common/constants';
import { TimeoutError } from './common/errors';
import { delay, promiseResult, promiseTimeout } from './common/util';
import { CleanupItem, RegistryEvents, RegistryOptions, TriggerOptions } from './common/interfaces';
import { AsyncFunc, FinishStatus, RegisterOptions, RemoveItem } from './common/types';

export class CleanupRegistry extends TypedEmitter<RegistryEvents> {
  private readonly preCleanup?: AsyncFunc;
  private readonly postCleanup?: AsyncFunc;
  private readonly overallTimeout: number;

  private registry: CleanupItem[] = [];
  private hasTriggered = false;
  private overallExpired = false;
  private overallExpireTimer: NodeJS.Timer | undefined;

  public constructor(registryOptions?: RegistryOptions) {
    super();
    this.preCleanup = registryOptions?.preCleanup;
    this.postCleanup = registryOptions?.postCleanup;
    this.overallTimeout = registryOptions?.overallTimeout ?? DEFAULT_OVERALL_TIMEOUT;
  }

  public register(registerItem: RegisterOptions): void {
    if (this.hasTriggered) {
      return;
    }

    const { func, id, timeout, timeoutAfterFailure } = registerItem;

    const itemId = id !== undefined ? id : func.name;

    let itemTimeout = this.overallTimeout;
    if (timeout !== undefined) {
      itemTimeout = timeout < this.overallTimeout ? timeout : this.overallTimeout;
    }

    let itemTimeoutAfterFailure = DAFAULT_TIMEOUT_AFTER_FAILURE;
    if (timeoutAfterFailure !== undefined) {
      itemTimeoutAfterFailure = timeoutAfterFailure < this.overallTimeout ? timeoutAfterFailure : this.overallTimeout;
    }

    this.registry.push({ func, id: itemId, timeout: itemTimeout, timeoutAfterFailure: itemTimeoutAfterFailure });
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

  public async trigger(triggerOptions: TriggerOptions = DEFAULT_TRIGGER_OPTIONS): Promise<void> {
    if (this.hasTriggered) {
      return;
    }

    const { shouldThrowIfPreErrors, shouldThrowIfPostErrors } = triggerOptions;
    this.hasTriggered = true;

    this.emit('started');

    this.initCleanupExpiredTimer();

    if (this.preCleanup) {
      const [preErr] = await promiseResult(this.preCleanup());
      if (preErr !== undefined && shouldThrowIfPreErrors === true) {
        this.finish('preThrown');
        throw preErr;
      }
    }

    await this.cleanup();

    if (this.postCleanup) {
      const [postErr] = await promiseResult(this.postCleanup());
      if (postErr !== undefined && shouldThrowIfPostErrors === true) {
        this.finish('postThrown');
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
      let error: unknown;

      do {
        const timeoutFunction = promiseTimeout(item.func(), item.timeout);

        [error] = await promiseResult(timeoutFunction);

        if (error !== undefined) {
          this.emit('itemFailed', item.id, error);
          const delayMs = error instanceof TimeoutError ? DAFAULT_TIMEOUT_AFTER_FAILURE : item.timeoutAfterFailure;
          await delay(delayMs);
        } else {
          this.emit('itemCompleted', item.id);
        }
      } while (error !== undefined && !this.overallExpired);
    });

    await Promise.allSettled(cleanupPromises);
  }

  private initCleanupExpiredTimer(): void {
    this.overallExpireTimer = setTimeout(() => {
      this.overallExpired = true;
    }, this.overallTimeout);
  }
}
