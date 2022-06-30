import { CleanupRegistry } from '../../src/registry';
import { TimeoutError } from '../../src/common/errors';
import { OVERALL_TIMEOUT, fakeAsyncFuncGenerator } from './helpers';

describe('registry', () => {
  const startedEventHandler = jest.fn();
  const itemFailedEventHandler = jest.fn();
  const itemCompletedEventHandler = jest.fn();
  const finishedEventHandler = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('trigger', () => {
    it('should emit an finished event with success if triggered function resolves', async function () {
      const registry = new CleanupRegistry();

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      registry.on('started', startedEventHandler);
      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(startedEventHandler).toHaveBeenCalled();
      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should emit an finished event with success if triggered function resolves eventually', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      const rejectsThenResolvesFunc = jest.fn().mockRejectedValueOnce(undefined).mockResolvedValue(undefined);

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const id = 'someId';
      registry.register({ func: rejectsThenResolvesFunc, id, timeoutAfterFailure: OVERALL_TIMEOUT / 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(rejectsThenResolvesFunc).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new Error('internal promise rejected with undefined'));
      expect(itemCompletedEventHandler).toHaveBeenCalledTimes(1);
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(id);
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should emit an finished event with timedout if triggered function keeps on expiring due to item timeout duration', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const id = 'someId';
      const itemTimeout = 100;
      const timeoutFunc = fakeAsyncFuncGenerator(OVERALL_TIMEOUT, false);
      registry.register({ func: timeoutFunc, id, timeout: itemTimeout, timeoutAfterFailure: 300 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new TimeoutError(`function timed out after ${itemTimeout} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit an finished event with timedout if triggered function keeps on rejecting', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      const error = new Error('fatal error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: rejectingFunc, timeoutAfterFailure: OVERALL_TIMEOUT / 4 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(rejectingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).toHaveBeenCalledTimes(4);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(rejectingFunc.name, error);
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit a finished event if registry is empty of functions', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should emit a finished success event if registry is empty and call pre and post cleanups', async function () {
      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      const registry = new CleanupRegistry({ preCleanup: resolvingFunc, postCleanup: resolvingFunc });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalledTimes(2);
      expect(itemCompletedEventHandler).not.toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should keep on successfully finishing the cleanup even if pre and post cleanups rejects', async function () {
      const rejectingPreCleanup = jest.fn().mockRejectedValue(undefined);
      const resolvingPostCleanup = jest.fn().mockResolvedValue(undefined);
      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      const registry = new CleanupRegistry({ preCleanup: rejectingPreCleanup, postCleanup: resolvingPostCleanup });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(rejectingPreCleanup).toHaveBeenCalled();
      expect(resolvingFunc).toHaveBeenCalled();
      expect(resolvingPostCleanup).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should emit a failed event for every time the function has exceeded the timeout duration', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(OVERALL_TIMEOUT, false);
      registry.register({ func: timeoutFunc, timeout: 100, timeoutAfterFailure: 300 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(timeoutFunc.name, new TimeoutError(`function timed out after ${100} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit a successful finished event if all triggered functions resolved', async function () {
      const registry = new CleanupRegistry();

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: resolvingFunc });
      registry.register({ func: resolvingFunc });
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalledTimes(3);
      expect(itemCompletedEventHandler).toHaveBeenCalledTimes(3);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit a failed event for every function that rejects with the proper reject reason', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      const error = new Error('error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);

      const timeoutFunc = fakeAsyncFuncGenerator(OVERALL_TIMEOUT * 2, false);

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: resolvingFunc, id: '1' });
      registry.register({ func: rejectingFunc, id: '2', timeoutAfterFailure: OVERALL_TIMEOUT });
      registry.register({ func: timeoutFunc, id: '3', timeout: OVERALL_TIMEOUT });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalledTimes(1);
      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemCompletedEventHandler).toHaveBeenCalledWith('1');
      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith('2', error);
      expect(itemFailedEventHandler).toHaveBeenCalledWith('3', new TimeoutError(`function timed out after ${OVERALL_TIMEOUT} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit an finished event with timedout if triggered function keeps on expiring due to registry timeout duration', async function () {
      const registryTimeout = OVERALL_TIMEOUT / 2;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      registry.register({ func: timeoutFunc, id: '1', timeout: registryTimeout * 2 });
      registry.register({ func: timeoutFunc, id: '2', timeout: registryTimeout * 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemCompletedEventHandler).not.toHaveBeenCalled();
      expect(itemFailedEventHandler).toHaveBeenCalledWith('1', new TimeoutError(`function timed out after ${registryTimeout} ms`));
      expect(itemFailedEventHandler).toHaveBeenCalledWith('2', new TimeoutError(`function timed out after ${registryTimeout} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should throw error if pre cleanup rejects and configured so', async function () {
      const error = new Error('pre cleanup error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);
      const registry = new CleanupRegistry({ preCleanup: rejectingFunc });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      await expect(registry.trigger({ shouldThrowIfPreErrors: true })).rejects.toThrow(error);

      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('preThrown');
    });

    it('should throw error if post cleanup rejects and configured so', async function () {
      const error = new Error('post cleanup error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);
      const registry = new CleanupRegistry({ postCleanup: rejectingFunc });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      await expect(registry.trigger({ shouldThrowIfPostErrors: true })).rejects.toThrow(error);

      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('postThrown');
    });
  });

  describe('register', function () {
    it('should register item with string id', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const stringId = 'someId';
      registry.register({ func: resolvingFunc, id: stringId });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(stringId);
    });

    it('should register item with symbol id', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const symbolId = Symbol('symbolId');
      registry.register({ func: resolvingFunc, id: symbolId });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(symbolId);
    });

    it('should register item with function name as id', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(resolvingFunc.name);
    });

    it('should not do anything if registering while on lock', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const rejectingFunc = jest.fn().mockRejectedValue(undefined);
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      registry.register({ func: rejectingFunc });

      expect(resolvingFunc).toHaveBeenCalled();
      expect(rejectingFunc).not.toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should set the item timeout to be the registry overall timeout if not set otherwise', async function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      registry.register({ func: timeoutFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledWith(timeoutFunc.name, new TimeoutError(`function timed out after ${registryTimeout} ms`));
    });

    it('should set the item timeout to be the not greater than the registry overall timeout', async function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      registry.register({ func: timeoutFunc, timeout: registryTimeout * 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledWith(timeoutFunc.name, new TimeoutError(`function timed out after ${registryTimeout} ms`));
    });

    it('should set the item timeout to given timeout', async function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      registry.register({ func: timeoutFunc, timeout: registryTimeout / 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledWith(timeoutFunc.name, new TimeoutError(`function timed out after ${registryTimeout / 2} ms`));
    });

    it('should set the item timeout after reject to be the not greater than the registry overall timeout', async function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(100, false);
      registry.register({ func: timeoutFunc, timeoutAfterFailure: registryTimeout * 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(timeoutFunc.name, new Error('internal promise rejected with undefined'));
    });
  });

  describe('remove', function () {
    it('should remove functions by ref', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const rejectingFunc = jest.fn().mockRejectedValue(undefined);
      registry.register({ func: rejectingFunc });
      registry.remove({ func: rejectingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(rejectingFunc).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalled();
    });

    it('should remove functions by id', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const itemId = 'someId';
      const anotherItemId = 'anotherId';

      registry.register({ func: resolvingFunc, id: itemId });
      registry.register({ func: resolvingFunc, id: itemId });
      registry.register({ func: resolvingFunc, id: anotherItemId });
      registry.remove({ id: itemId });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemCompletedEventHandler).toHaveBeenCalledTimes(1);
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(anotherItemId);
      expect(finishedEventHandler).toHaveBeenCalled();
    });

    it('should remove functions by ref and id', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const error = new Error();
      const rejectingFunc = jest.fn().mockRejectedValue(error);
      const anotherRejectingFunc = jest.fn().mockRejectedValue(error);

      const itemId = 'someId';
      registry.register({ func: rejectingFunc, id: itemId });
      registry.register({ func: rejectingFunc, timeoutAfterFailure: OVERALL_TIMEOUT });
      registry.register({ func: anotherRejectingFunc, id: itemId, timeoutAfterFailure: OVERALL_TIMEOUT });

      registry.remove({ func: rejectingFunc, id: itemId });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(rejectingFunc.name, error);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(itemId, error);
      expect(finishedEventHandler).toHaveBeenCalledTimes(1);
    });

    it('should lock the registry after trigger and not remove any functions', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      registry.remove({ func: resolvingFunc });

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalled();
    });
  });

  describe('clear', function () {
    it('should clear the registry and not invoke any item events', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const rejectingFunc = jest.fn().mockRejectedValue(undefined);
      registry.register({ func: resolvingFunc });
      registry.register({ func: rejectingFunc });
      registry.clear();

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(rejectingFunc).not.toHaveBeenCalled();
      expect(resolvingFunc).not.toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('success');
    });

    it('should lock the registry until cleared', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();
      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledTimes(1);
      expect(finishedEventHandler).toHaveBeenNthCalledWith(1, 'success');

      const anotherResolvingFunc = jest.fn().mockResolvedValue(undefined);
      registry.register({ func: anotherResolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();
      expect(anotherResolvingFunc).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledTimes(1);

      registry.clear();

      registry.register({ func: anotherResolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();
      expect(anotherResolvingFunc).toHaveBeenCalledTimes(1);
      expect(resolvingFunc).toHaveBeenCalledTimes(1);
      expect(finishedEventHandler).toHaveBeenCalledTimes(2);
      expect(finishedEventHandler).toHaveBeenNthCalledWith(2, 'success');
    });
  });
});
