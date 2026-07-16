import { API_BASE_URL } from './api-base';
import { getAuthToken, refreshToken } from './passkey';

export const CLOUD_DRIVE_ENCRYPTION_VERSION = 'aes-gcm-hkdf-v1';

export interface CloudDriveFile {
  id: string;
  name: string;
  mimeType: string;
  plaintextSize: number;
  encryptedSize: number;
  contentHash: string;
  encryptionVersion: string;
  iv: string;
  onchainTxHash: string | null;
  status: 'stored' | 'anchored';
  createdAt: string;
  updatedAt: string;
}

export interface CloudDriveState {
  quotaBytes: number;
  usedBytes: number;
  files: CloudDriveFile[];
}

export interface EncryptedCloudDrivePayload {
  blob: Blob;
  name: string;
  mimeType: string;
  plaintextSize: number;
  contentHash: string;
  encryptionVersion: string;
  iv: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function deriveCloudDriveKey(
  privateKey: Uint8Array,
  walletAddress: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(privateKey),
    'HKDF',
    false,
    ['deriveKey'],
  );
  const salt = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(walletAddress.toLowerCase()),
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('INJ Pass Cloud Drive encryption v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptCloudDriveFile(
  file: File,
  privateKey: Uint8Array,
  walletAddress: string,
): Promise<EncryptedCloudDrivePayload> {
  const key = await deriveCloudDriveKey(privateKey, walletAddress);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    await file.arrayBuffer(),
  );
  const digest = await crypto.subtle.digest('SHA-256', encrypted);

  return {
    blob: new Blob([encrypted], { type: 'application/octet-stream' }),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    plaintextSize: file.size,
    contentHash: bytesToHex(new Uint8Array(digest)),
    encryptionVersion: CLOUD_DRIVE_ENCRYPTION_VERSION,
    iv: bytesToBase64(iv),
  };
}

export async function decryptCloudDriveFile(
  encrypted: ArrayBuffer,
  file: CloudDriveFile,
  privateKey: Uint8Array,
  walletAddress: string,
): Promise<Blob> {
  if (file.encryptionVersion !== CLOUD_DRIVE_ENCRYPTION_VERSION) {
    throw new Error('This file uses an unsupported encryption version.');
  }
  const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encrypted)));
  if (digest.toLowerCase() !== file.contentHash.toLowerCase()) {
    throw new Error('Encrypted file integrity check failed.');
  }
  const key = await deriveCloudDriveKey(privateKey, walletAddress);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(file.iv)) },
    key,
    encrypted,
  );
  return new Blob([plaintext], { type: file.mimeType || 'application/octet-stream' });
}

async function fetchWithDriveAuth(url: string, init: RequestInit): Promise<Response> {
  const makeRequest = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const token = getAuthToken();
  const firstResponse = await makeRequest(token);
  if (firstResponse.status !== 401 || !token) return firstResponse;
  const nextToken = await refreshToken(token);
  return nextToken ? makeRequest(nextToken) : firstResponse;
}

async function requireOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
  throw new Error(payload.message || payload.error || 'Cloud Drive request failed.');
}

export async function getCloudDrive(): Promise<CloudDriveState> {
  const response = await fetchWithDriveAuth(`${API_BASE_URL}/cloud-drive`, {
    method: 'GET',
  });
  await requireOk(response);
  return response.json();
}

export async function uploadCloudDriveFile(
  payload: EncryptedCloudDrivePayload,
): Promise<CloudDriveFile> {
  const reservationResponse = await fetchWithDriveAuth(`${API_BASE_URL}/cloud-drive/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      mimeType: payload.mimeType,
      plaintextSize: payload.plaintextSize,
      encryptedSize: payload.blob.size,
      contentHash: payload.contentHash,
      encryptionVersion: payload.encryptionVersion,
      iv: payload.iv,
    }),
  });
  await requireOk(reservationResponse);
  const reservation = await reservationResponse.json() as {
    uploadId: string;
    uploadUrl: string;
  };

  try {
    const uploadResponse = await fetch(reservation.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload.blob,
    });
    if (!uploadResponse.ok) {
      throw new Error('Encrypted upload to Cloud Drive failed.');
    }

    const completeResponse = await fetchWithDriveAuth(
      `${API_BASE_URL}/cloud-drive/uploads/${encodeURIComponent(reservation.uploadId)}/complete`,
      { method: 'POST' },
    );
    await requireOk(completeResponse);
    return completeResponse.json();
  } catch (error) {
    await deleteCloudDriveFile(reservation.uploadId).catch(() => undefined);
    throw error;
  }
}

export async function downloadCloudDriveCiphertext(fileId: string): Promise<ArrayBuffer> {
  const response = await fetchWithDriveAuth(
    `${API_BASE_URL}/cloud-drive/files/${encodeURIComponent(fileId)}/content`,
    { method: 'GET' },
  );
  await requireOk(response);
  return response.arrayBuffer();
}

export async function markCloudDriveFileAnchored(
  fileId: string,
  transactionHash: string,
): Promise<CloudDriveFile> {
  const response = await fetchWithDriveAuth(
    `${API_BASE_URL}/cloud-drive/files/${encodeURIComponent(fileId)}/anchor`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash }),
    },
  );
  await requireOk(response);
  return response.json();
}

export async function deleteCloudDriveFile(fileId: string): Promise<void> {
  const response = await fetchWithDriveAuth(
    `${API_BASE_URL}/cloud-drive/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
  await requireOk(response);
}
