/// <reference lib="webworker" />

import { validateTransfer } from './transfer-codec';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    self.postMessage({ ok: true, validation: await validateTransfer(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'This transfer could not be checked safely.'
    });
  }
};

export {};
