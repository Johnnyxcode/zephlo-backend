import { AsyncLocalStorage } from 'async_hooks';

export type TenantContextStore = {
  tenantId: string;
  tenantSlug: string;
};

export const tenantStorage = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore {
  const store = tenantStorage.getStore();
  if (!store) {
    throw new Error('Tenant context is not available');
  }
  return store;
}
