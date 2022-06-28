import { TimeoutError } from './errors';

export const promiseResult = async <T>(promise: Promise<T>): Promise<[undefined, T] | [Error, undefined]> => {
  try {
    const value = await promise;
    return [undefined, value];
  } catch (error) {
    return [error !== undefined ? (error as Error) : new Error(), undefined];
  }
};

export const promiseTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timer;

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
