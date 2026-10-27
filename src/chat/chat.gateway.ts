import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { IncomingMessage } from 'node:http';
import type { Server, Socket } from 'socket.io';
import { JwtStrategy } from '../auth/jwt-strategy/jwt-strategy.js';
import { getConfiguredAuthOrigins } from '../auth/session-cookie.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { ChatService } from './chat.service.js';

type AuthenticatedUser = {
  sub: string;
  email: string;
  name: string;
};

type AuthenticatedSocket = Socket & {
  data: Socket['data'] & { user: AuthenticatedUser };
};

type SocketAck = (response: {
  ok: boolean;
  data?: unknown;
  error?: { statusCode: number; message: string | string[] };
}) => void;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const MAX_MESSAGES_PER_MINUTE = 20;
const socketOrigins = getConfiguredAuthOrigins();

@WebSocketGateway({
  cors: {
    origin: socketOrigins,
    credentials: true,
  },
  allowRequest: (request: IncomingMessage, callback) => {
    const origin = request.headers.origin;
    if (!origin) {
      callback(null, true);
      return;
    }

    if (socketOrigins.length > 0) {
      callback(null, socketOrigins.includes(origin));
      return;
    }

    try {
      const parsedOrigin = new URL(origin);
      const sameOriginHost =
        parsedOrigin.origin === origin &&
        parsedOrigin.host.toLowerCase() ===
          request.headers.host?.toLowerCase();
      const secureInProduction =
        process.env.NODE_ENV !== 'production' ||
        parsedOrigin.protocol === 'https:';
      callback(
        null,
        sameOriginHost &&
          secureInProduction &&
          ['http:', 'https:'].includes(parsedOrigin.protocol),
      );
    } catch {
      callback(null, false);
    }
  },
})
@Injectable()
export class ChatGateway
  implements OnGatewayConnection<AuthenticatedSocket>, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly sendWindows = new Map<
    string,
    { resetAt: number; count: number }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.readAccessToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      client.data.user = this.jwtStrategy.validate(payload);
      await client.join(this.userRoom(client.data.user.sub));
    } catch (error) {
      if (error instanceof UnauthorizedException || this.isJwtError(error)) {
        client.disconnect(true);
        return;
      }
      throw error;
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data.user?.sub;
    if (!userId) {
      return;
    }

    const activeSockets = this.server?.sockets.adapter.rooms.get(
      this.userRoom(userId),
    );
    if (!activeSockets?.size) {
      this.sendWindows.delete(userId);
    }
  }

  @SubscribeMessage('chat:conversation:join')
  async joinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: SocketAck,
  ) {
    return this.respond(ack, async () => {
      const conversationId = this.readConversationId(payload);
      await this.chatService.getConversation(
        client.data.user.sub,
        conversationId,
      );
      await client.join(this.conversationRoom(conversationId));
      return { conversationId, joined: true };
    });
  }

  @SubscribeMessage('chat:conversation:leave')
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: SocketAck,
  ) {
    return this.respond(ack, async () => {
      const conversationId = this.readConversationId(payload);
      await client.leave(this.conversationRoom(conversationId));
      return { conversationId, left: true };
    });
  }

  @SubscribeMessage('chat:message:send')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: SocketAck,
  ) {
    return this.respond(ack, async () => {
      this.assertSendRateLimit(client.data.user.sub);
      const conversationId = this.readConversationId(payload);
      const dto = await this.validatePayload(
        SendMessageDto,
        this.readMessagePayload(payload),
      );
      const result = await this.chatService.sendMessage(
        client.data.user.sub,
        conversationId,
        dto,
      );
      if (!result.duplicate) {
        this.publishMessage(
          result.message,
          result.conversation,
          result.unreadUpdates,
        );
      }
      return result.message;
    });
  }

  @SubscribeMessage('chat:message:read')
  async markRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: SocketAck,
  ) {
    return this.respond(ack, async () => {
      const conversationId = this.readConversationId(payload);
      const result = await this.chatService.markRead(
        client.data.user.sub,
        conversationId,
      );
      this.publishRead(client.data.user.sub, result);
      return result;
    });
  }

  publishMessage(
    message: {
      id: string;
      conversationId: string;
      senderId: string;
      sequence: number;
      clientMessageId: string;
      content: string;
      createdAt: Date;
    },
    conversation: {
      id: string;
      kind: string;
      title: string | null;
      createdBy: string;
      adminUserId: string | null;
      lastMessage: {
        content: string | null;
        senderId: string | null;
        sequence: number;
        createdAt: Date;
      } | null;
      createdAt: Date;
      updatedAt: Date;
    },
    unreadUpdates: Array<{ userId: string; unreadCount: number }>,
  ) {
    this.requireServer()
      .to(this.conversationRoom(message.conversationId))
      .emit('chat:message:new', message);
    this.requireServer()
      .to(this.conversationRoom(message.conversationId))
      .emit('chat:conversation:update', conversation);

    for (const update of unreadUpdates) {
      this.requireServer()
        .to(this.userRoom(update.userId))
        .emit('chat:unread:update', {
          conversationId: message.conversationId,
          unreadCount: update.unreadCount,
        });
    }
  }

  publishRead(
    userId: string,
    update: {
      conversationId: string;
      lastReadSequence: number;
      unreadCount: number;
    },
  ) {
    this.requireServer()
      .to(this.conversationRoom(update.conversationId))
      .emit('chat:message:read', { ...update, userId });
    this.requireServer()
      .to(this.userRoom(userId))
      .emit('chat:unread:update', {
        conversationId: update.conversationId,
        unreadCount: update.unreadCount,
      });
  }

  publishConversationAvailable(conversationId: string, userIds: string[]) {
    for (const userId of userIds) {
      this.requireServer()
        .to(this.userRoom(userId))
        .emit('chat:conversation:available', { conversationId });
    }
  }

  publishMembershipChange(
    conversationId: string,
    currentMemberIds: string[],
    removedUserId?: string,
  ) {
    const server = this.requireServer();
    const room = this.conversationRoom(conversationId);
    server.to(room).emit('chat:conversation:members', {
      conversationId,
      memberIds: currentMemberIds,
    });
    for (const userId of currentMemberIds) {
      server
        .to(this.userRoom(userId))
        .emit('chat:conversation:available', { conversationId });
    }
    if (removedUserId) {
      server
        .to(this.userRoom(removedUserId))
        .emit('chat:conversation:removed', { conversationId });
      server.in(this.userRoom(removedUserId)).socketsLeave(room);
    }
  }

  private async respond<T>(
    ack: SocketAck | undefined,
    action: () => Promise<T>,
  ) {
    if (!ack) {
      throw new BadRequestException('Uma confirmação Socket.IO é obrigatória.');
    }
    try {
      ack({ ok: true, data: await action() });
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }

      const response = error.getResponse();
      const responseMessage =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response
            ? response.message
            : null;
      const message =
        typeof responseMessage === 'string'
          ? responseMessage
          : Array.isArray(responseMessage)
            ? responseMessage.filter(
                (entry): entry is string => typeof entry === 'string',
              )
            : 'Não foi possível processar a solicitação.';
      ack({
        ok: false,
        error: {
          statusCode: error.getStatus(),
          message,
        },
      });
    }
  }

  private async validatePayload<T extends object>(
    dtoType: new () => T,
    payload: unknown,
  ) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new BadRequestException('Payload inválido.');
    }
    const dto = plainToInstance(dtoType, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
    return dto;
  }

  private readConversationId(payload: unknown) {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('conversationId' in payload) ||
      typeof payload.conversationId !== 'string' ||
      !OBJECT_ID_PATTERN.test(payload.conversationId)
    ) {
      throw new BadRequestException('O identificador da conversa é inválido.');
    }
    return payload.conversationId;
  }

  private readMessagePayload(payload: unknown) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new BadRequestException('Payload inválido.');
    }
    return {
      clientMessageId:
        'clientMessageId' in payload ? payload.clientMessageId : undefined,
      content: 'content' in payload ? payload.content : undefined,
    };
  }

  private readAccessToken(client: AuthenticatedSocket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer\s+(.+)$/i.exec(authorization)
        : null;
    return match?.[1];
  }

  private assertSendRateLimit(userId: string) {
    const now = Date.now();
    const current = this.sendWindows.get(userId);
    if (!current || current.resetAt <= now) {
      this.sendWindows.set(userId, {
        resetAt: now + 60_000,
        count: 1,
      });
      return;
    }
    if (current.count >= MAX_MESSAGES_PER_MINUTE) {
      throw new HttpException(
        'Limite de envio de mensagens excedido.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private isJwtError(error: unknown) {
    return (
      error instanceof Error &&
      ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(
        error.name,
      )
    );
  }

  private requireServer() {
    if (!this.server) {
      throw new Error('O gateway do chat ainda não foi inicializado.');
    }
    return this.server;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }
}
