import type { LocalMnemonicVaultV1 } from './types';

const DB_NAME = 'inj-pass';
const DB_VERSION = 1;
const STORE_NAME = 'mnemonic-vaults';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Encrypted wallet storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'address' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open encrypted wallet storage.'));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => {
      resolve(request.result);
      database.close();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Encrypted wallet storage failed.'));
      database.close();
    };
    transaction.onabort = transaction.onerror;
  }));
}

export async function putVault(vault: LocalMnemonicVaultV1): Promise<void> {
  await transact('readwrite', (store) => store.put({ ...vault, address: vault.address.toLowerCase() }));
}

export async function getVault(address: string): Promise<LocalMnemonicVaultV1 | null> {
  const vault = await transact<LocalMnemonicVaultV1 | undefined>(
    'readonly',
    (store) => store.get(address.toLowerCase()),
  );
  return vault ?? null;
}

export async function deleteVault(address: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(address.toLowerCase()));
}
