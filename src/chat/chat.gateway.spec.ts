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
  const listConversations = vi.fn().mockResolvedValue([]);
  let gateway: ChatGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    listConversations.mockResolvedValue([]);
    gateway = new ChatGateway(
      { verifyAsync } as unknown as JwtService,
      { validate } as unknown as JwtStrategy,
      { getConversation, sendMessage, listConversations } as unknown as ChatService,
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

  it('mantém a janela enquanto existir outro socket do usuário em outra instância', async () => {
    const window = { resetAt: Date.now(), count: 1 };
    Reflect.set(gateway, 'sendWindows', new Map([[user.sub, window]]));
    const allSockets = vi.fn().mockResolvedValue(new Set(['socket-em-outra-instancia']));
    const server = { in: vi.fn(() => ({ allSockets })) } as unknown as Server;
    Reflect.set(gateway, 'server', server);
    await gateway.handleDisconnect({ data: { user } } as Socket & { data: { user: typeof user } });
    expect(server.in).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(allSockets).toHaveBeenCalled();
    expect(Reflect.get(gateway, 'sendWindows').has(user.sub)).toBe(true);
  });

  it('remove a janela quando não restam sockets do usuário', async () => {
    Reflect.set(gateway, 'sendWindows', new Map([[user.sub, { resetAt: Date.now(), count: 1 }]]));
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const server = {
      in: vi.fn(() => ({ allSockets: vi.fn().mockResolvedValue(new Set()) })),
      to,
    } as unknown as Server;
    Reflect.set(gateway, 'server', server);
    listConversations.mockResolvedValue([
      { id: conversationId, members: [{ userId: user.sub }] },
    ]);
    await gateway.handleDisconnect({ data: { user } } as Socket & { data: { user: typeof user } });
    expect(Reflect.get(gateway, 'sendWindows').has(user.sub)).toBe(false);
    expect(to).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(emit).toHaveBeenCalledWith('chat:presence:update', {
      userId: user.sub,
      online: false,
    });
  });

  it('broadcasts typing only to the conversation room and excludes the sender', async () => {
    getConversation.mockResolvedValue({ id: conversationId });
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const client = { data: { user }, to } as unknown as Socket & {
      data: { user: typeof user };
    };

    await gateway.handleTyping(client, { conversationId });

    expect(getConversation).toHaveBeenCalledWith(user.sub, conversationId);
    expect(to).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(emit).toHaveBeenCalledWith('chat:typing', {
      conversationId,
      userId: user.sub,
    });
  });

  it('ignores typing from users who are not conversation members', async () => {
    getConversation.mockRejectedValue(new NotFoundException());
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const client = { data: { user }, to } as unknown as Socket & {
      data: { user: typeof user };
    };

    await expect(
      gateway.handleTyping(client, { conversationId }),
    ).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('ignores a malformed typing payload without throwing', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const client = { data: { user }, to } as unknown as Socket & {
      data: { user: typeof user };
    };

    await expect(
      gateway.handleTyping(client, { conversationId: 'bad' }),
    ).resolves.toBeUndefined();
    expect(getConversation).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('publica presença online apenas na primeira conexão do usuário', async () => {
    verifyAsync.mockResolvedValue({ sub: user.sub });
    validate.mockReturnValue(user);
    listConversations.mockResolvedValue([
      { id: conversationId, members: [{ userId: user.sub }] },
    ]);
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const server = {
      in: vi.fn(() => ({
        allSockets: vi.fn().mockResolvedValue(new Set(['socket-1'])),
      })),
      to,
    } as unknown as Server;
    Reflect.set(gateway, 'server', server);
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as Socket & { data: { user?: typeof user } };

    await gateway.handleConnection(client);

    expect(server.in).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(listConversations).toHaveBeenCalledWith(user.sub);
    expect(to).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(emit).toHaveBeenCalledWith('chat:presence:update', {
      userId: user.sub,
      online: true,
    });
  });

  it('não publica presença quando já existe outro socket do usuário', async () => {
    verifyAsync.mockResolvedValue({ sub: user.sub });
    validate.mockReturnValue(user);
    const emit = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({
        allSockets: vi
          .fn()
          .mockResolvedValue(new Set(['socket-1', 'socket-2'])),
      })),
      to: vi.fn(() => ({ emit })),
    } as unknown as Server);
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as Socket & { data: { user?: typeof user } };

    await gateway.handleConnection(client);

    expect(emit).not.toHaveBeenCalled();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('publica presença offline quando não resta nenhum socket do usuário', async () => {
    const sendWindows = new Map([
      [user.sub, { resetAt: Date.now(), count: 1 }],
    ]);
    Reflect.set(gateway, 'sendWindows', sendWindows);
    const deleteWindow = vi.spyOn(sendWindows, 'delete');
    listConversations.mockResolvedValue([
      { id: conversationId, members: [{ userId: user.sub }] },
    ]);
    const emit = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({ allSockets: vi.fn().mockResolvedValue(new Set()) })),
      to: vi.fn(() => ({ emit })),
    } as unknown as Server);

    await gateway.handleDisconnect({
      data: { user },
    } as Socket & { data: { user: typeof user } });

    expect(emit).toHaveBeenCalledWith('chat:presence:update', {
      userId: user.sub,
      online: false,
    });
    expect(deleteWindow).toHaveBeenCalledWith(user.sub);
    expect(deleteWindow.mock.invocationCallOrder[0]).toBeGreaterThan(
      emit.mock.invocationCallOrder[0]!,
    );
  });

  it('mantém a janela quando ainda existe socket do usuário na desconexão', async () => {
    const window = { resetAt: Date.now(), count: 1 };
    Reflect.set(gateway, 'sendWindows', new Map([[user.sub, window]]));
    const emit = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({
        allSockets: vi.fn().mockResolvedValue(new Set(['socket-em-outra-instancia'])),
      })),
      to: vi.fn(() => ({ emit })),
    } as unknown as Server);

    await gateway.handleDisconnect({
      data: { user },
    } as Socket & { data: { user: typeof user } });

    expect(emit).not.toHaveBeenCalled();
    expect(Reflect.get(gateway, 'sendWindows').get(user.sub)).toBe(window);
  });

  it('envia snapshot de presença apenas ao socket que entrou na conversa', async () => {
    const otherUserId = '65f1234567890abcdef12346';
    getConversation.mockResolvedValue({
      id: conversationId,
      members: [{ userId: user.sub }, { userId: otherUserId }],
    });
    const clientEmit = vi.fn();
    const allSockets = vi.fn((room: string) => ({
      allSockets: vi.fn().mockResolvedValue(
        room === `user:${otherUserId}` ? new Set(['socket-outro']) : new Set(),
      ),
    }));
    Reflect.set(gateway, 'server', { in: allSockets } as unknown as Server);
    const client = {
      data: { user },
      join: vi.fn(),
      emit: clientEmit,
    } as unknown as Socket & { data: { user: typeof user } };
    const ack = vi.fn();

    await gateway.joinConversation(client, { conversationId }, ack);

    expect(allSockets).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(allSockets).toHaveBeenCalledWith(`user:${otherUserId}`);
    expect(clientEmit).toHaveBeenCalledWith('chat:presence:snapshot', {
      conversationId,
      presences: [
        { userId: user.sub, online: false },
        { userId: otherUserId, online: true },
      ],
    });
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      data: { conversationId, joined: true },
    });
  });

  it('preserva o ack de entrada mesmo se a publicação de presença falhar', async () => {
    getConversation.mockResolvedValue({
      id: conversationId,
      members: [
        { userId: user.sub },
        { userId: '65f1234567890abcdef12346' },
      ],
    });
    const clientEmit = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({
        allSockets: vi.fn().mockRejectedValue(new Error('Redis indisponível')),
      })),
    } as unknown as Server);
    const client = {
      data: { user },
      join: vi.fn(),
      emit: clientEmit,
    } as unknown as Socket & { data: { user: typeof user } };
    const ack = vi.fn();

    await gateway.joinConversation(client, { conversationId }, ack);

    expect(client.join).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(clientEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      data: { conversationId, joined: true },
    });
  });

  it('preserva o ack de entrada se o envio do snapshot falhar', async () => {
    getConversation.mockResolvedValue({
      id: conversationId,
      members: [{ userId: user.sub }],
    });
    const clientEmit = vi.fn(() => {
      throw new Error('Socket indisponível');
    });
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({ allSockets: vi.fn().mockResolvedValue(new Set()) })),
    } as unknown as Server);
    const client = {
      data: { user },
      join: vi.fn(),
      emit: clientEmit,
    } as unknown as Socket & { data: { user: typeof user } };
    const ack = vi.fn();

    await gateway.joinConversation(client, { conversationId }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: true,
      data: { conversationId, joined: true },
    });
  });

  it('não desconecta cliente se listConversations falhar ao publicar presença', async () => {
    verifyAsync.mockResolvedValue({ sub: user.sub });
    validate.mockReturnValue(user);
    listConversations.mockRejectedValue(new Error('Redis indisponível'));
    const emit = vi.fn();
    const disconnect = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({
        allSockets: vi.fn().mockResolvedValue(new Set(['socket-1'])),
      })),
      to: vi.fn(() => ({ emit })),
    } as unknown as Server);
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      disconnect,
    } as unknown as Socket & { data: { user?: typeof user } };

    await expect(gateway.handleConnection(client)).resolves.toBeUndefined();

    expect(client.join).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(disconnect).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('não desconecta cliente se allSockets falhar ao publicar presença', async () => {
    verifyAsync.mockResolvedValue({ sub: user.sub });
    validate.mockReturnValue(user);
    const emit = vi.fn();
    const disconnect = vi.fn();
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({
        allSockets: vi.fn().mockRejectedValue(new Error('Redis indisponível')),
      })),
      to: vi.fn(() => ({ emit })),
    } as unknown as Server);
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      disconnect,
    } as unknown as Socket & { data: { user?: typeof user } };

    await expect(gateway.handleConnection(client)).resolves.toBeUndefined();

    expect(client.join).toHaveBeenCalledWith(`user:${user.sub}`);
    expect(disconnect).not.toHaveBeenCalled();
    expect(listConversations).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('mantém a limpeza da janela se listConversations falhar na desconexão', async () => {
    Reflect.set(gateway, 'sendWindows', new Map([[user.sub, { resetAt: Date.now(), count: 1 }]]));
    listConversations.mockRejectedValue(new Error('Redis indisponível'));
    Reflect.set(gateway, 'server', {
      in: vi.fn(() => ({ allSockets: vi.fn().mockResolvedValue(new Set()) })),
    } as unknown as Server);

    await gateway.handleDisconnect({
      data: { user },
    } as Socket & { data: { user: typeof user } });

    expect(Reflect.get(gateway, 'sendWindows').has(user.sub)).toBe(false);
  });
});
