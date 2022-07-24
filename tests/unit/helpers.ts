export const OVERALL_TIMEOUT = 1000;

export const fakeAsyncFuncGenerator = (durationMs: number, shouldResolve: boolean): (() => Promise<void>) => {
  return async (): Promise<void> => {
    return new Promise((resolve, rejects) => {
      setTimeout(() => {
        if (shouldResolve) {
          resolve();
        }
        rejects();
      }, durationMs);
    });
  };
};
