import { TimeoutError } from './errors';

export const promiseResult = async <T>(promise: Promise<T>): Promise<[undefined, T] | [Error, undefined]> => {
  try {
    const value = await promise;
    return [undefined, value];
  } catch (error) {
    return [error instanceof Error ? error : new Error('internal promise rejected with undefined'), undefined];
  }
};

export const promiseTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new TimeoutError(`function timed out after ${ms} ms`));
    }, ms);
  });

  return Promise.race([
    timeout,
    promise.then((value) => {
      clearTimeout(timer);
      return value;
    }),
  ]);
};

export const delay = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
