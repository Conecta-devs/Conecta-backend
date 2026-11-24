import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdapter } = vi.hoisted(() => ({
  createAdapter: vi.fn(() => vi.fn()),
}));

const { createClient, connect, duplicate, quit } = vi.hoisted(() => {
  const connect = vi.fn().mockResolvedValue(undefined);
  const quit = vi.fn().mockResolvedValue(undefined);
  const subClient = { connect, quit };
  const duplicate = vi.fn(() => subClient);
  const pubClient = { connect, quit, duplicate };
  const createClient = vi.fn(() => pubClient);
  return { createClient, connect, duplicate, quit };
});

vi.mock('@socket.io/redis-adapter', () => ({ createAdapter }));
vi.mock('redis', () => ({ createClient }));

import { RedisIoAdapter, createChatSocketAdapter } from './redis-io.adapter.js';

describe('createChatSocketAdapter', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('usa o adapter local quando REDIS_URL não está definida em desenvolvimento', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'test';

    const adapter = await createChatSocketAdapter({} as INestApplicationContext);

    expect(adapter).toBeInstanceOf(IoAdapter);
    expect(adapter).not.toBeInstanceOf(RedisIoAdapter);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('falha quando REDIS_URL não está definida em produção', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'production';

    await expect(
      createChatSocketAdapter({} as INestApplicationContext),
    ).rejects.toThrow('REDIS_URL');
  });

  it('aplica o adapter Redis a cada servidor Socket.IO criado', async () => {
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const applyAdapter = vi.fn();
    const fakeServer = { adapter: applyAdapter } as unknown as Server;
    vi.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue(fakeServer);

    const adapter = await createChatSocketAdapter({} as INestApplicationContext);

    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(adapter.createIOServer(0)).toBe(fakeServer);
    expect(applyAdapter).toHaveBeenCalledWith(createAdapter.mock.results[0].value);
  });

  it('encerra os dois clientes Redis ao fechar o servidor', async () => {
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const close = vi.spyOn(IoAdapter.prototype, 'close').mockResolvedValue(undefined);

    const adapter = await createChatSocketAdapter({} as INestApplicationContext);

    await adapter.close({} as Server);

    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(2);
  });
});
