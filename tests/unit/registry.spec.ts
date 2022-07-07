import { CleanupRegistry } from '../../src/registry';
import { AlreadyTriggeredError, RegisterError, TimeoutError } from '../../src/common/errors';
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
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(startedEventHandler).toHaveBeenCalled();
      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalled();
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

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(OVERALL_TIMEOUT / itemTimeout);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new TimeoutError(`function timed out after ${itemTimeout} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit an finished event with timedout if triggered function keeps on expiring due to internal undefined exception', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const id = 'someId';
      const itemTimeout = 100;
      const timeoutFunc = fakeAsyncFuncGenerator(50, false);
      registry.register({ func: timeoutFunc, id, timeout: itemTimeout, timeoutAfterFailure: 300 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(3);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, Error('internal promise rejected with undefined'));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit an finished event with timedout if triggered function keeps on rejecting', async function () {
      const registry = new CleanupRegistry({ overallTimeout: OVERALL_TIMEOUT });

      const error = new Error('fatal error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      const id = registry.register({ func: rejectingFunc, timeoutAfterFailure: OVERALL_TIMEOUT / 4 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(rejectingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).toHaveBeenCalledTimes(4);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, error);
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

    it('should emit an item completed event with matching item id', async function () {
      const registry = new CleanupRegistry();

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);

      registry.on('itemCompleted', itemCompletedEventHandler);

      const itemId = registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(itemId);
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
      const itemTimeout = 100;
      const id = registry.register({ func: timeoutFunc, timeout: itemTimeout, timeoutAfterFailure: 300 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(OVERALL_TIMEOUT / itemTimeout);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new TimeoutError(`function timed out after ${100} ms`));
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

      const id1 = registry.register({ func: resolvingFunc, id: '1' });
      const id2 = registry.register({ func: rejectingFunc, id: Symbol('2'), timeoutAfterFailure: OVERALL_TIMEOUT });
      const id3 = registry.register({ func: timeoutFunc, timeout: OVERALL_TIMEOUT });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalledTimes(1);
      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(id1);
      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id2, error);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(id3, new TimeoutError(`function timed out after ${OVERALL_TIMEOUT} ms`));
      expect(finishedEventHandler).toHaveBeenCalledWith('timedout');
    });

    it('should emit an finished event with timedout if triggered function keeps on expiring due to registry timeout duration', async function () {
      const registryTimeout = OVERALL_TIMEOUT / 2;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      registry.register({ func: timeoutFunc, id: '1', timeout: registryTimeout });
      registry.register({ func: timeoutFunc, id: '2', timeout: registryTimeout });

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

      await expect(registry.trigger({ ignorePreError: false })).rejects.toThrow(error);

      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('preFailed');
    });

    it('should throw error if post cleanup rejects and configured so', async function () {
      const error = new Error('post cleanup error');
      const rejectingFunc = jest.fn().mockRejectedValue(error);
      const registry = new CleanupRegistry({ postCleanup: rejectingFunc });

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('finished', finishedEventHandler);

      await expect(registry.trigger({ ignorePostError: false })).rejects.toThrow(error);

      expect(rejectingFunc).toHaveBeenCalledTimes(1);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(finishedEventHandler).toHaveBeenCalledWith('postFailed');
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

    it('should register item with random id', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemFailed', itemFailedEventHandler);
      registry.on('itemCompleted', itemCompletedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      const id = registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(resolvingFunc).toHaveBeenCalled();
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
      expect(itemCompletedEventHandler).toHaveBeenCalledWith(id);
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

      expect(() => registry.register({ func: rejectingFunc })).toThrow(AlreadyTriggeredError);

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
      const id = registry.register({ func: timeoutFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new TimeoutError(`function timed out after ${registryTimeout} ms`));
    });

    it('should throw register error if item timeout is greater than the registry overall timeout', function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      const badOptions = { func: timeoutFunc, timeout: registryTimeout * 2 };
      expect(() => registry.register(badOptions)).toThrow(RegisterError);

      expect(itemFailedEventHandler).not.toHaveBeenCalled();
    });

    it('should set the item timeout to given timeout', async function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(registryTimeout * 2, false);
      const id = registry.register({ func: timeoutFunc, timeout: registryTimeout / 2 });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledWith(id, new TimeoutError(`function timed out after ${registryTimeout / 2} ms`));
    });

    it('should throw register error if item timeout after reject is greater than the registry overall timeout', function () {
      const registryTimeout = OVERALL_TIMEOUT;
      const registry = new CleanupRegistry({ overallTimeout: registryTimeout });

      registry.on('itemFailed', itemFailedEventHandler);

      const timeoutFunc = fakeAsyncFuncGenerator(100, false);

      const badOptions = { func: timeoutFunc, timeoutAfterFailure: registryTimeout * 2 };

      expect(() => registry.register(badOptions)).toThrow(RegisterError);
      expect(itemFailedEventHandler).not.toHaveBeenCalled();
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
      const randomId = registry.register({ func: rejectingFunc, timeoutAfterFailure: OVERALL_TIMEOUT });
      registry.register({ func: anotherRejectingFunc, id: itemId, timeoutAfterFailure: OVERALL_TIMEOUT });

      registry.remove({ func: rejectingFunc, id: itemId });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(itemFailedEventHandler).toHaveBeenCalledTimes(2);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(randomId, error);
      expect(itemFailedEventHandler).toHaveBeenCalledWith(itemId, error);
      expect(finishedEventHandler).toHaveBeenCalledTimes(1);
    });

    it('should throw error if remove is called on a triggered registry', async function () {
      const registry = new CleanupRegistry();

      registry.on('itemCompleted', itemCompletedEventHandler);
      registry.on('finished', finishedEventHandler);

      const resolvingFunc = jest.fn().mockResolvedValue(undefined);
      registry.register({ func: resolvingFunc });

      await expect(registry.trigger()).resolves.not.toThrow();

      expect(() => registry.remove({ func: resolvingFunc })).toThrow(AlreadyTriggeredError);

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

    it('should throw error if registry have already been triggered until its cleared', async function () {
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
      expect(() => registry.register({ func: anotherResolvingFunc })).toThrow(AlreadyTriggeredError);

      await expect(registry.trigger()).rejects.toThrow(AlreadyTriggeredError);
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
