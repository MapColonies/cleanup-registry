import { TypedEmitter } from 'tiny-typed-emitter';
import { nanoid } from 'nanoid';
import { DEFAULT_TIMEOUT_AFTER_FAILURE, DEFAULT_OVERALL_TIMEOUT, DEFAULT_TRIGGER_OPTIONS } from './common/constants';
import { AlreadyTriggeredError, RegisterError, TimeoutError } from './common/errors';
import { delay, promiseResult, promiseTimeout } from './common/util';
import { CleanupItem, ILogger, RegistryEvents, RegistryOptions, TriggerOptions } from './common/interfaces';
import { AsyncFunc, FinishStatus, ItemId, RegisterOptions, RemoveItem } from './common/types';

export class CleanupRegistry extends TypedEmitter<RegistryEvents> {
  private hasTriggered = false;
  private readonly preCleanupHook?: AsyncFunc;
  private readonly postCleanupHook?: AsyncFunc;
  private readonly overallTimeout: number;
  private readonly logger?: ILogger;

  private registry: CleanupItem[] = [];
  private overallExpired = false;
  private overallExpireTimer: NodeJS.Timeout | undefined;

  public constructor(registryOptions?: RegistryOptions) {
    super();

    this.preCleanupHook = registryOptions?.preCleanupHook;
    this.postCleanupHook = registryOptions?.postCleanupHook;
    this.overallTimeout = registryOptions?.overallTimeout ?? DEFAULT_OVERALL_TIMEOUT;
    this.logger = registryOptions?.logger;
  }

  public get hasAlreadyTriggered(): boolean {
    return this.hasTriggered;
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
        const error = new RegisterError(`given item timeout ${timeout} is greater than overall cleanup registry timeout ${this.overallTimeout}`);
        this.logger?.error({ msg: 'REGISTER FAILED', itemId, itemTimeout: timeout, overallTimeout: this.overallTimeout, error });
        throw error;
      }
      itemTimeout = timeout;
    }

    let itemTimeoutAfterFailure = DEFAULT_TIMEOUT_AFTER_FAILURE;
    if (timeoutAfterFailure !== undefined) {
      if (timeoutAfterFailure > this.overallTimeout) {
        const error = new RegisterError(
          `given item timeoutAfterFailure ${timeoutAfterFailure} is greater than overall cleanup registry timeout ${this.overallTimeout}`
        );
        this.logger?.error({
          msg: 'REGISTER FAILED',
          itemId,
          itemTimeoutAfterFailure: timeoutAfterFailure,
          overallTimeout: this.overallTimeout,
          error,
        });
        throw error;
      }
      itemTimeoutAfterFailure = timeoutAfterFailure;
    }

    this.registry.push({ func, id: itemId, timeout: itemTimeout, timeoutAfterFailure: itemTimeoutAfterFailure });

    this.logger?.debug({ msg: 'ITEM REGISTERED', itemId, itemTimeout, itemTimeoutAfterFailure, registrySize: this.registry.length });

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
    this.logger?.info({ msg: 'CLEANUP REGISTRY STARTED', overallTimeout: this.overallTimeout, registrySize: this.registry.length });

    this.initCleanupExpiredTimer();

    if (this.preCleanupHook) {
      const [preErr] = await promiseResult(this.preCleanupHook());
      if (preErr !== undefined) {
        this.logger?.error({ msg: 'PRE-CLEANUP HOOK FAILED', ignorePreError, error: preErr });
        if (ignorePreError === false) {
          this.finish('preFailed');
          throw preErr as Error;
        }
      }
    }

    await this.cleanup();

    if (this.postCleanupHook && !this.overallExpired) {
      const [postErr] = await promiseResult(this.postCleanupHook());
      if (postErr !== undefined) {
        this.logger?.error({ msg: 'POST-CLEANUP HOOK FAILED', ignorePostError, error: postErr });
        if (ignorePostError === false) {
          this.finish('postFailed');
          throw postErr as Error;
        }
      }
    }

    this.finish(this.overallExpired ? 'timeout' : 'success');
  }

  public clear(): void {
    this.logger?.debug({ msg: 'CLEANUP REGISTRY CLEARED', registrySize: this.registry.length });
    this.registry = [];
    this.hasTriggered = false;
    this.overallExpired = false;
    clearTimeout(this.overallExpireTimer);
  }

  private finish(status: FinishStatus): void {
    clearTimeout(this.overallExpireTimer);
    this.emit('finished', status);
    this.logger?.info({ msg: 'CLEANUP REGISTRY FINISHED', status });
  }

  private async cleanup(): Promise<void> {
    const cleanupPromises = this.registry.map(async (item) => {
      let itemCompleted = false;

      while (!itemCompleted && !this.overallExpired) {
        const timeoutFunction = promiseTimeout(item.func(), item.timeout);

        const [error] = await promiseResult(timeoutFunction);

        if (error !== undefined) {
          this.emit('itemFailed', item.id, error);
          this.logger?.error({
            msg: 'ITEM CLEANUP FAILED',
            itemId: item.id,
            itemTimeout: item.timeout,
            itemTimeoutAfterFailure: item.timeoutAfterFailure,
            error,
          });
          if (!(error instanceof TimeoutError)) {
            await delay(item.timeoutAfterFailure);
          }
        } else {
          itemCompleted = true;
          this.logger?.info({ msg: 'ITEM CLEANUP COMPLETED', itemId: item.id });
          this.emit('itemCompleted', item.id);
        }
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  private initCleanupExpiredTimer(): void {
    this.overallExpireTimer = setTimeout(() => {
      this.overallExpired = true;
      this.logger?.warn({ msg: 'OVERALL TIMEOUT EXPIRED', overallTimeout: this.overallTimeout });
    }, this.overallTimeout);
  }
}
