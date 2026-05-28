import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export class MemoryStateStore {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.values = new Map();
  }

  async get(key) {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return clone(entry.value);
  }

  async set(key, value, ttlMs = 0) {
    this.values.set(key, {
      value: clone(value),
      expiresAt: ttlMs ? this.now() + ttlMs : 0
    });
  }

  async delete(key) {
    this.values.delete(key);
  }

  async increment(key, ttlMs = 0) {
    const current = await this.get(key);
    const next = Number(current || 0) + 1;
    await this.set(key, next, ttlMs);
    return next;
  }
}

export class RedisStateStore {
  constructor(options = {}) {
    if (!options.url) throw new Error('RedisStateStore requires a Redis URL.');
    this.url = new URL(options.url);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }

  async get(key) {
    const raw = await this.command('GET', key);
    return raw === null ? null : JSON.parse(raw);
  }

  async set(key, value, ttlMs = 0) {
    const payload = JSON.stringify(value);
    if (ttlMs) {
      await this.command('SET', key, payload, 'PX', String(ttlMs));
    } else {
      await this.command('SET', key, payload);
    }
  }

  async delete(key) {
    await this.command('DEL', key);
  }

  async increment(key, ttlMs = 0) {
    const value = Number(await this.command('INCR', key));
    if (ttlMs && value === 1) await this.command('PEXPIRE', key, String(ttlMs));
    return value;
  }

  async close() {
    if (!this.socket) return;
    this.socket.end();
    this.socket = null;
  }

  async command(...parts) {
    const socket = await this.connect();
    socket.write(encodeCommand(parts));
    return this.readReply();
  }

  connect() {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket);
    return new Promise((resolve, reject) => {
      const port = Number(this.url.port || (this.url.protocol === 'rediss:' ? 6380 : 6379));
      const host = this.url.hostname;
      const connectOptions = { host, port };
      const socket = this.url.protocol === 'rediss:'
        ? tls.connect(connectOptions)
        : net.connect(connectOptions);
      socket.once('error', reject);
      socket.once('connect', async () => {
        socket.off('error', reject);
        socket.on('data', chunk => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
        });
        this.socket = socket;
        try {
          if (this.url.password) await this.command('AUTH', decodeURIComponent(this.url.password));
          if (this.url.pathname && this.url.pathname !== '/') {
            await this.command('SELECT', this.url.pathname.slice(1));
          }
          resolve(socket);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async readReply() {
    while (true) {
      const parsed = parseReply(this.buffer);
      if (parsed) {
        this.buffer = this.buffer.slice(parsed.offset);
        return parsed.value;
      }
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

export function createStateStore(options = {}) {
  if (options.redisUrl) return new RedisStateStore({ url: options.redisUrl });
  return null;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function encodeCommand(parts) {
  const encoded = ['*' + parts.length];
  for (const part of parts) {
    const value = Buffer.from(String(part));
    encoded.push('$' + value.length);
    encoded.push(value.toString());
  }
  return encoded.join('\r\n') + '\r\n';
}

function parseReply(buffer) {
  if (!buffer.length) return null;
  const type = String.fromCharCode(buffer[0]);
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd === -1) return null;
  const line = buffer.slice(1, lineEnd).toString();
  const offset = lineEnd + 2;
  if (type === '+') return { value: line, offset };
  if (type === ':') return { value: Number(line), offset };
  if (type === '-') throw new Error('Redis error: ' + line);
  if (type === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, offset };
    const end = offset + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.slice(offset, end).toString(), offset: end + 2 };
  }
  throw new Error('Unsupported Redis reply type: ' + type);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
