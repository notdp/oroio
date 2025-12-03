import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

const OROIO_DIR = path.join(os.homedir(), '.oroio');
const KEYS_FILE = path.join(OROIO_DIR, 'keys.enc');
const CURRENT_FILE = path.join(OROIO_DIR, 'current');
const CACHE_FILE = path.join(OROIO_DIR, 'list_cache.b64');
const DK_PATH = path.join(os.homedir(), '.local', 'bin', 'dk');

const SALT = 'oroio';

export interface KeyUsage {
  balance: number | null;
  total: number | null;
  used: number | null;
  expires: string;
  raw: string;
}

export interface KeyInfo {
  key: string;
  index: number;
  isCurrent: boolean;
  usage: KeyUsage | null;
}

function deriveKeyAndIV(salt: Buffer): { key: Buffer; iv: Buffer } {
  const iterations = 10000;
  const keyLength = 32;
  const ivLength = 16;
  
  const derived = crypto.pbkdf2Sync(SALT, salt, iterations, keyLength + ivLength, 'sha256');
  
  return {
    key: derived.subarray(0, keyLength),
    iv: derived.subarray(keyLength, keyLength + ivLength),
  };
}

export async function decryptKeys(encryptedData: Buffer): Promise<string[]> {
  const header = encryptedData.subarray(0, 8).toString('utf8');
  if (header !== 'Salted__') {
    throw new Error('Invalid encrypted file format');
  }
  
  const salt = encryptedData.subarray(8, 16);
  const ciphertext = encryptedData.subarray(16);
  
  const { key, iv } = deriveKeyAndIV(salt);
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  
  const text = decrypted.toString('utf8');
  return text.split('\n').filter(line => line.trim()).map(line => line.split('\t')[0]);
}

async function readEncryptedKeys(): Promise<Buffer> {
  return fs.readFile(KEYS_FILE);
}

async function readCurrentIndex(): Promise<number> {
  try {
    const content = await fs.readFile(CURRENT_FILE, 'utf8');
    return parseInt(content.trim(), 10) || 1;
  } catch {
    return 1;
  }
}

function parseUsageInfo(text: string): KeyUsage {
  const lines = text.split('\n');
  const data: Record<string, string> = {};
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=');
    if (key) {
      data[key] = valueParts.join('=');
    }
  }
  
  return {
    balance: data['BALANCE_NUM'] ? parseFloat(data['BALANCE_NUM']) : null,
    total: data['TOTAL'] ? parseFloat(data['TOTAL']) : null,
    used: data['USED'] ? parseFloat(data['USED']) : null,
    expires: data['EXPIRES'] || '?',
    raw: data['RAW'] || '',
  };
}

async function readCache(): Promise<Map<number, KeyUsage>> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf8');
    const lines = content.split('\n');
    if (lines.length < 3) return new Map();
    
    const result = new Map<number, KeyUsage>();
    
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const [idxStr, b64] = line.split('\t');
      if (!idxStr || !b64) continue;
      
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const usage = parseUsageInfo(decoded);
        result.set(parseInt(idxStr, 10), usage);
      } catch {
        // skip invalid entries
      }
    }
    
    return result;
  } catch {
    return new Map();
  }
}

export async function getKeyList(): Promise<KeyInfo[]> {
  try {
    const [encryptedData, currentIndex, cache] = await Promise.all([
      readEncryptedKeys(),
      readCurrentIndex(),
      readCache(),
    ]);
    
    const keys = await decryptKeys(encryptedData);
    
    return keys.map((key, idx) => ({
      key,
      index: idx + 1,
      isCurrent: idx + 1 === currentIndex,
      usage: cache.get(idx) || null,
    }));
  } catch (error) {
    console.error('Failed to get key list:', error);
    return [];
  }
}

export async function getCurrentKey(): Promise<KeyInfo | null> {
  const keys = await getKeyList();
  return keys.find(k => k.isCurrent) || null;
}

export async function addKey(key: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(`"${DK_PATH}" add "${key}"`, { timeout: 10000 });
    if (stderr) {
      return { success: false, error: stderr.trim() };
    }
    await refreshCache();
    return { success: true, message: stdout.trim() };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to add key' };
  }
}

export async function removeKey(index: number): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(`"${DK_PATH}" rm ${index}`, { timeout: 10000 });
    if (stderr) {
      return { success: false, error: stderr.trim() };
    }
    return { success: true, message: stdout.trim() };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to remove key' };
  }
}

export async function useKey(index: number): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(`"${DK_PATH}" use ${index}`, { timeout: 10000 });
    if (stderr) {
      return { success: false, error: stderr.trim() };
    }
    return { success: true, message: stdout.trim() };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to switch key' };
  }
}

export async function refreshCache(): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`"${DK_PATH}" list`, { timeout: 30000 });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to refresh' };
  }
}

export function maskKey(key: string): string {
  if (key.length <= 10) {
    return key.slice(0, 3) + '***';
  }
  return key.slice(0, 6) + '...' + key.slice(-4);
}
