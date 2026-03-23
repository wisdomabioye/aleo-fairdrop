// @ts-nocheck
import { wrap } from 'comlink';

let singleton = null;
let rawWorker = null;

const AleoWorker = () => {
  if (!singleton) {
    rawWorker = new Worker(new URL('./worker', import.meta.url), { type: 'module' });
    rawWorker.onerror = (event) => console.error('[AleoWorker]', event?.message);
    singleton = wrap(rawWorker);
    singleton.terminate = () => {
      rawWorker?.terminate();
      singleton = null;
      rawWorker = null;
    };
  }
  return singleton;
};

export { AleoWorker };
