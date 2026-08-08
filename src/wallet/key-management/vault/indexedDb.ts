import type { LocalMnemonicVaultV1 } from './types';

const DB_NAME = 'inj-pass';
const STORE_NAME = 'mnemonic-vaults';

function ensureVaultStore(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_NAME)) {
    database.createObjectStore(STORE_NAME, { keyPath: 'address' });
  }
}

function finishOpen(database: IDBDatabase): IDBDatabase {
  database.onversionchange = () => database.close();
  return database;
}

function upgradeDatabase(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => ensureVaultStore(request.result);
    request.onsuccess = () => resolve(finishOpen(request.result));
    request.onerror = () => reject(request.error ?? new Error('Unable to upgrade encrypted wallet storage.'));
    request.onblocked = () => reject(new Error('Close other AgentOS tabs, then try opening the wallet again.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Encrypted wallet storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => ensureVaultStore(request.result);
    request.onsuccess = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) {
        resolve(finishOpen(database));
        return;
      }

      const nextVersion = database.version + 1;
      database.close();
      void upgradeDatabase(nextVersion).then(resolve, reject);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open encrypted wallet storage.'));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      request = run(transaction.objectStore(STORE_NAME));
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
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

export async function listVaults(): Promise<LocalMnemonicVaultV1[]> {
  return transact<LocalMnemonicVaultV1[]>('readonly', (store) => store.getAll());
}

export async function deleteVault(address: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(address.toLowerCase()));
}
