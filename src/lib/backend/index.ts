import { AppwriteAdapter } from './appwrite';
import { BackendAdapter } from './types';

export * from './types';
export * from './validation';
export { MemoryBackendAdapter } from './memory';

let activeAdapter: BackendAdapter = new AppwriteAdapter();

export function getBackendAdapter(): BackendAdapter {
  return activeAdapter;
}

export function setBackendAdapterForTest(adapter: BackendAdapter): void {
  activeAdapter = adapter;
}

export function resetBackendAdapter(): void {
  activeAdapter = new AppwriteAdapter();
}
