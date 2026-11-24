import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import type { Server, ServerOptions } from 'socket.io';

const logger = new Logger('RedisIoAdapter');

export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly pubClient: RedisClientType,
    private readonly subClient: RedisClientType,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
  }
}

export async function createChatSocketAdapter(
  app: INestApplicationContext,
): Promise<IoAdapter> {
  const url = process.env.REDIS_URL?.trim();

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL é obrigatória em produção.');
    }
    logger.warn('REDIS_URL não definida: usando adapter Socket.IO local.');
    return new IoAdapter(app);
  }

  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  logger.log('Redis adapter conectado');
  return new RedisIoAdapter(app, pubClient, subClient);
}
