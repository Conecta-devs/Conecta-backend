import { NotFoundException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JwtStrategy } from '../auth/jwt-strategy/jwt-strategy.js';
import type { ChatService } from './chat.service.js';
import { ChatGateway } from './chat.gateway.js';

const user = {
  sub: '65f1234567890abcdef12345',
  email: 'user@example.com',
  name: 'Test User',
};
const conversationId = '65f1234567890abcdef12347';

describe('ChatGateway', () => {
  const verifyAsync = vi.fn();
  const validate = vi.fn();
  const getConversation = vi.fn();
  const sendMessage = vi.fn();
  let gateway: ChatGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new ChatGateway(
      { verifyAsync } as unknown as JwtService,
      { validate } as unknown as JwtStrategy,
      { getConversation, sendMessage } as unknown as ChatService,
    );
  });

  it('authenticates the access token before placing a socket in its private user room', async () => {
    verifyAsync.mockResolvedValue({ sub: user.sub });
    validate.mockReturnValue(user);
    const join = vi.fn();
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join,
      disconnect: vi.fn(),
    } as unknown as Socket & { data: { user: typeof user } };

    await gateway.handleConnection(client);

    expect(verifyAsync).toHaveBeenCalledWith('access-token');
    expect(validate).toHaveBeenCalledWith({ sub: user.sub });
    expect(join).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(client.data.user).toEqual(user);
  });

  it('disconnects clients that do not present an access token', async () => {
    const disconnect = vi.fn();
    const client = {
      handshake: { auth: {}, headers: {} },
      data: {},
      join: vi.fn(),
      disconnect,
    } as unknown as Socket & { data: { user?: typeof user } };

    await gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledWith(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('does not join a conversation room when membership authorization fails', async () => {
    getConversation.mockRejectedValue(new NotFoundException());
    const ack = vi.fn();
    const join = vi.fn();
    const client = {
      data: { user },
      join,
    } as unknown as Socket & { data: { user: typeof user } };

    await gateway.joinConversation(client, { conversationId }, ack);

    expect(join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: { statusCode: 404, message: 'Not Found' },
    });
  });

  it('emits a new message only after the service confirms persistence', async () => {
    const emittedEvents: string[] = [];
    sendMessage.mockImplementation(async () => {
      emittedEvents.push('persisted');
      return {
        message: {
          id: '65f1234567890abcdef12348',
          conversationId,
          senderId: user.sub,
          sequence: 4,
          clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
          content: 'hello',
          createdAt: new Date(),
        },
        conversation: {
          id: conversationId,
          kind: 'direct',
          title: null,
          createdBy: user.sub,
          adminUserId: null,
          lastMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        unreadUpdates: [{ userId: '65f1234567890abcdef12346', unreadCount: 1 }],
        duplicate: false,
      };
    });
    const server = {
      to: () => ({
        emit: (event: string) => emittedEvents.push(event),
      }),
    } as unknown as Server;
    Reflect.set(gateway, 'server', server);
    const client = { data: { user } } as Socket & {
      data: { user: typeof user };
    };
    const ack = vi.fn();

    await gateway.sendMessage(
      client,
      {
        conversationId,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'hello',
      },
      ack,
    );

    expect(emittedEvents[0]).toBe('persisted');
    expect(emittedEvents).toContain('chat:message:new');
    expect(emittedEvents).toContain('chat:conversation:update');
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ sequence: 4 }),
      }),
    );
  });
});
