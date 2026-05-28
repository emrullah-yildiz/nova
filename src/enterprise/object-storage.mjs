import fs from 'node:fs/promises';
import path from 'node:path';

export class MemoryObjectStorage {
  constructor() {
    this.objects = new Map();
  }

  async putObject(key, body) {
    this.objects.set(key, Buffer.from(body));
  }

  async getObject(key) {
    const value = this.objects.get(key);
    if (!value) return null;
    return Buffer.from(value);
  }

  async deleteObject(key) {
    this.objects.delete(key);
  }
}

export class FileObjectStorage {
  constructor(rootDir) {
    if (!rootDir) throw new Error('FileObjectStorage requires a root directory.');
    this.rootDir = rootDir;
  }

  async putObject(key, body) {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(body));
  }

  async getObject(key) {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async deleteObject(key) {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }

  resolveKey(key) {
    const safeParts = String(key || '').split('/').filter(Boolean);
    if (safeParts.some(part => part === '..' || part.includes('\\'))) {
      throw new Error('Invalid object storage key.');
    }
    return path.join(this.rootDir, ...safeParts);
  }
}

export function createObjectStorage(options = {}) {
  if (options.objectStorage) return options.objectStorage;
  if (options.objectStorageDir) return new FileObjectStorage(options.objectStorageDir);
  return new MemoryObjectStorage();
}
