/** Both the most recent request and the current selection must still match. */
export function createLatestRequest(getSelection: () => string) {
  let revision = 0;
  return {
    invalidate() { revision += 1; },
    async run<T>(
      selection: string,
      read: () => Promise<T>,
      commit: (value: T) => void,
      fail: (error: unknown) => void,
    ) {
      // A completed mutation for an old day must not supersede a current read.
      if (selection !== getSelection()) return;
      const request = ++revision;
      const current = () => request === revision && selection === getSelection();
      let result: T;
      try {
        result = await read();
      } catch (error) {
        if (current()) fail(error);
        return;
      }
      if (current()) commit(result);
    },
  };
}
