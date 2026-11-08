import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard.js';
import { JwtStrategy } from '../auth/jwt-strategy/jwt-strategy.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

const testSecret = 'chat-controller-test-secret';
const currentUserId = '65f1234567890abcdef12345';

describe('ChatController HTTP discovery endpoint', () => {
  let app: INestApplication;
  let previousJwtSecret: string | undefined;
  let discoverUsers: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = testSecret;
    discoverUsers = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
      ],
      controllers: [ChatController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        { provide: ChatService, useValue: { discoverUsers } },
        { provide: ChatGateway, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it('returns the public discovery response as JSON with authenticated access', async () => {
    discoverUsers.mockResolvedValue({
      users: [
        { id: '65f1234567890abcdef12346', name: 'Bruna', image: null },
      ],
      page: 1,
      limit: 24,
      hasMore: false,
    });
    const token = new JwtService({ secret: testSecret }).sign({
      sub: currentUserId,
      email: 'probe@example.invalid',
      name: 'Probe',
    });

    const response = await request(app.getHttpServer())
      .get('/chat/users?page=1&limit=24')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      users: [
        { id: '65f1234567890abcdef12346', name: 'Bruna', image: null },
      ],
      page: 1,
      limit: 24,
      hasMore: false,
    });
    expect(discoverUsers).toHaveBeenCalledWith(
      currentUserId,
      expect.objectContaining({ page: '1', limit: '24' }),
    );
  });

  it('keeps an empty discovery response as HTTP 200 with an empty array', async () => {
    discoverUsers.mockResolvedValue({
      users: [],
      page: 1,
      limit: 24,
      hasMore: false,
    });
    const token = new JwtService({ secret: testSecret }).sign({
      sub: currentUserId,
      email: 'probe@example.invalid',
      name: 'Probe',
    });

    const response = await request(app.getHttpServer())
      .get('/chat/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.users).toEqual([]);
    expect(typeof response.body.page).toBe('number');
    expect(typeof response.body.limit).toBe('number');
    expect(typeof response.body.hasMore).toBe('boolean');
  });

  it('rejects unauthenticated discovery requests with an HTTP error', async () => {
    await request(app.getHttpServer())
      .get('/chat/users')
      .expect(401)
      .expect(({ body }) => {
        expect(body.statusCode).toBe(401);
        expect(body).toHaveProperty('message');
        expect(body).not.toHaveProperty('users');
      });
    expect(discoverUsers).not.toHaveBeenCalled();
  });
});
