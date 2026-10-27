import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast/execution';
import { acc } from '@prisma/orm-mongo/query-builder';
import { db } from '../prisma/db.js';
import { AddMembersDto } from './dto/add-members.dto.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { DiscoverUsersQueryDto } from './dto/discover-users-query.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DIRECT_KIND = 'direct';
const GROUP_KIND = 'group';
const ADMIN_ROLE = 'admin';
const MEMBER_ROLE = 'member';
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;
const DEFAULT_USER_PAGE_SIZE = 24;
const MAX_USER_PAGE_SIZE = 50;
const MAX_USER_PAGE = 1000;

@Injectable()
export class ChatService {
  async discoverUsers(userId: string, query: DiscoverUsersQueryDto) {
    this.validateObjectId(userId, 'Usuário');
    const search = query.search?.normalize('NFKC').trim() ?? '';
    const containsControlCharacter = Array.from(search).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
    if (containsControlCharacter) {
      throw new BadRequestException('A pesquisa contém caracteres inválidos.');
    }

    const page = this.parsePositiveInteger(query.page, 'page', true) ?? 1;
    if (page > MAX_USER_PAGE) {
      throw new BadRequestException(
        'A página está fora do intervalo permitido.',
      );
    }
    const requestedLimit =
      this.parsePositiveInteger(query.limit, 'limit', true) ??
      DEFAULT_USER_PAGE_SIZE;
    const limit = Math.min(requestedLimit, MAX_USER_PAGE_SIZE);

    let usersQuery = db.orm.users.where(MongoFieldFilter.neq('_id', userId));
    if (search) {
      usersQuery = usersQuery.where(
        MongoFieldFilter.of('name', '$regex', `^${this.escapeRegex(search)}`),
      );
    }

    const results = await usersQuery
      .select('_id', 'name', 'image')
      .orderBy({ name: 1, _id: 1 })
      .offset((page - 1) * limit)
      .limit(limit + 1)
      .all();
    const hasMore = results.length > limit;

    return {
      users: results.slice(0, limit).map((user) => ({
        id: user._id,
        name: user.name,
        image: user.image ?? null,
      })),
      page,
      limit,
      hasMore,
    };
  }

  async listConversations(userId: string) {
    const memberships = await db.orm.chat_members
      .where({ userId })
      .orderBy({ lastActivityAt: -1 })
      .limit(50)
      .all();

    return Promise.all(
      memberships.map(async (membership) => {
        const conversation = await this.findConversation(
          membership.conversationId,
        );
        if (!conversation) {
          return null;
        }

        const [members, unreadCount] = await Promise.all([
          this.listMembers(conversation._id, conversation.adminUserId),
          this.countUnread(
            conversation._id,
            userId,
            membership.lastReadSequence,
          ),
        ]);

        return {
          ...this.toConversationResponse(conversation),
          members,
          unreadCount,
        };
      }),
    ).then((items) => items.filter((item) => item !== null));
  }

  async createOrGetDirectConversation(userId: string, participantId: string) {
    this.validateObjectId(userId, 'Usuário');
    this.validateObjectId(participantId, 'Participante');
    if (userId === participantId) {
      throw new BadRequestException(
        'Uma conversa individual exige outro usuário.',
      );
    }

    const participantIds = [userId, participantId].sort();
    const directKey = participantIds.join(':');
    await this.assertUsersExist(participantIds);
    const conversationId = this.deterministicId(
      `direct:${participantIds.join(':')}`,
    );
    const now = new Date();

    let conversation = await this.findConversation(conversationId);
    if (!conversation) {
      try {
        conversation = await db.orm.chat_conversations.create({
          _id: conversationId,
          kind: DIRECT_KIND,
          title: null,
          directKey,
          createdBy: userId,
          adminUserId: null,
          sequence: 0,
          lastMessageSequence: 0,
          lastMessageContent: null,
          lastMessageSenderId: null,
          lastMessageAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
        conversation = await this.findConversation(conversationId);
        if (!conversation) {
          throw error;
        }
      }
    }

    if (conversation.kind !== DIRECT_KIND) {
      throw new ConflictException(
        'Não foi possível criar a conversa individual.',
      );
    }
    if (conversation.directKey !== directKey) {
      throw new ConflictException(
        'Conflito ao verificar a conversa individual.',
      );
    }

    await Promise.all(
      participantIds.map((participant) =>
        this.ensureMember(conversationId, participant, now, 0),
      ),
    );

    return this.getConversation(userId, conversationId);
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    this.validateObjectId(userId, 'Usuário');
    const title = dto.name.trim();
    if (!title) {
      throw new BadRequestException('O nome do grupo não pode estar vazio.');
    }
    if (!Array.isArray(dto.memberIds)) {
      throw new BadRequestException('A lista de membros do grupo é inválida.');
    }
    const memberIds = [...new Set(dto.memberIds)].filter((id) => id !== userId);
    if (memberIds.length > 49) {
      throw new BadRequestException(
        'O grupo pode ter no máximo 50 participantes.',
      );
    }
    for (const memberId of memberIds) {
      this.validateObjectId(memberId, 'Participante');
    }

    await this.assertUsersExist([userId, ...memberIds]);
    const now = new Date();
    const conversationId = randomBytes(12).toString('hex');
    const conversation = await db.orm.chat_conversations.create({
      _id: conversationId,
      kind: GROUP_KIND,
      title,
      directKey: null,
      createdBy: userId,
      adminUserId: userId,
      sequence: 0,
      lastMessageSequence: 0,
      lastMessageContent: null,
      lastMessageSenderId: null,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      this.ensureMember(conversationId, userId, now, 0),
      ...memberIds.map((memberId) =>
        this.ensureMember(conversationId, memberId, now, 0),
      ),
    ]);

    return this.getConversation(userId, conversation._id);
  }

  async getConversation(userId: string, conversationId: string) {
    const { conversation, membership } = await this.requireMembership(
      userId,
      conversationId,
    );
    const [members, unreadCount] = await Promise.all([
      this.listMembers(conversationId, conversation.adminUserId),
      this.countUnread(conversationId, userId, membership.lastReadSequence),
    ]);

    return {
      ...this.toConversationResponse(conversation),
      members,
      unreadCount,
      currentUserRole:
        conversation.adminUserId === userId ? ADMIN_ROLE : MEMBER_ROLE,
    };
  }

  async getHistory(
    userId: string,
    conversationId: string,
    beforeValue?: string,
    limitValue?: string,
  ) {
    await this.requireMembership(userId, conversationId);
    const before = this.parsePositiveInteger(beforeValue, 'before', true);
    const limit = this.parseLimit(limitValue);

    const query = db.orm.chat_messages
      .where({ conversationId })
      .orderBy({ sequence: -1 });
    const page = await (
      before === undefined
        ? query
        : query.where(MongoFieldFilter.lt('sequence', before))
    )
      .limit(limit + 1)
      .all();
    const hasMore = page.length > limit;
    const messages = page.slice(0, limit).reverse();

    return {
      messages: messages.map((message) => this.toMessageResponse(message)),
      nextCursor: hasMore ? String(messages[0]!.sequence) : null,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    await this.requireMembership(userId, conversationId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('A mensagem não pode estar vazia.');
    }
    if (content.length > 4000) {
      throw new BadRequestException(
        'A mensagem excede o limite de 4000 caracteres.',
      );
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dto.clientMessageId,
      )
    ) {
      throw new BadRequestException(
        'O identificador idempotente deve ser UUID v4.',
      );
    }

    const messageId = this.deterministicId(
      `message:${conversationId}:${userId}:${dto.clientMessageId}`,
    );
    const existingMessage = await db.orm.chat_messages
      .where({ _id: messageId })
      .first();
    if (existingMessage) {
      this.assertSameMessageRequest(
        existingMessage,
        conversationId,
        userId,
        dto.clientMessageId,
        content,
      );
      const latest = await this.refreshConversationSummary(
        conversationId,
        existingMessage,
      );
      await this.advanceMemberActivity(
        conversationId,
        existingMessage.sequence,
        existingMessage.createdAt,
      );
      return {
        message: this.toMessageResponse(existingMessage),
        conversation: this.toConversationResponse(latest),
        unreadUpdates: [],
        duplicate: true,
      };
    }

    const now = new Date();
    const updatedConversation = await db.orm.chat_conversations
      .where({ _id: conversationId })
      .update((fields) => [fields.sequence.inc(1), fields.updatedAt.set(now)]);
    if (!updatedConversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const sequence = updatedConversation.sequence;
    let message;
    try {
      message = await db.orm.chat_messages.create({
        _id: messageId,
        conversationId,
        senderId: userId,
        sequence,
        clientMessageId: dto.clientMessageId,
        content,
        createdAt: now,
      });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }
      const duplicate = await db.orm.chat_messages
        .where({ _id: messageId })
        .first();
      if (!duplicate) {
        throw error;
      }
      this.assertSameMessageRequest(
        duplicate,
        conversationId,
        userId,
        dto.clientMessageId,
        content,
      );
      const latest = await this.refreshConversationSummary(
        conversationId,
        duplicate,
      );
      await this.advanceMemberActivity(
        conversationId,
        duplicate.sequence,
        duplicate.createdAt,
      );
      return {
        message: this.toMessageResponse(duplicate),
        conversation: this.toConversationResponse(latest),
        unreadUpdates: [],
        duplicate: true,
      };
    }

    const latestConversation = await this.refreshConversationSummary(
      conversationId,
      message,
    );
    await this.advanceMemberActivity(conversationId, sequence, now);
    const members = await db.orm.chat_members.where({ conversationId }).all();
    const unreadUpdates = await Promise.all(
      members
        .filter((member) => member.userId !== userId)
        .map(async (member) => ({
          userId: member.userId,
          unreadCount: await this.countUnread(
            conversationId,
            member.userId,
            member.lastReadSequence,
          ),
        })),
    );

    return {
      message: this.toMessageResponse(message),
      conversation: this.toConversationResponse(latestConversation),
      unreadUpdates,
      duplicate: false,
    };
  }

  async markRead(userId: string, conversationId: string) {
    const { conversation, membership } = await this.requireMembership(
      userId,
      conversationId,
    );
    const sequence = conversation.lastMessageSequence;

    let updatedMembership = membership;
    for (
      let attempt = 0;
      attempt < 5 && updatedMembership.lastReadSequence < sequence;
      attempt += 1
    ) {
      const updated = await db.orm.chat_members
        .where({
          _id: updatedMembership._id,
          userId,
          lastReadSequence: updatedMembership.lastReadSequence,
        })
        .update({ lastReadSequence: sequence });
      if (updated) {
        updatedMembership = updated;
        break;
      }

      const latest = await this.findMember(userId, conversationId);
      if (!latest) {
        throw new NotFoundException('Conversa não encontrada.');
      }
      updatedMembership = latest;
    }

    if (updatedMembership.lastReadSequence < sequence) {
      throw new ConflictException(
        'O cursor de leitura foi atualizado simultaneamente.',
      );
    }
    const unreadCount = await this.countUnread(
      conversationId,
      userId,
      updatedMembership.lastReadSequence,
    );
    return {
      conversationId,
      lastReadSequence: updatedMembership.lastReadSequence,
      unreadCount,
    };
  }

  async addMembers(userId: string, conversationId: string, dto: AddMembersDto) {
    const { conversation } = await this.requireAdministrator(
      userId,
      conversationId,
    );
    if (conversation.kind !== GROUP_KIND) {
      throw new BadRequestException(
        'Membros só podem ser gerenciados em grupos.',
      );
    }

    const memberIds = [...new Set(dto.memberIds)];
    for (const memberId of memberIds) {
      this.validateObjectId(memberId, 'Participante');
    }
    await this.assertUsersExist(memberIds);

    const now = new Date();
    const results = await Promise.all(
      memberIds.map((memberId) =>
        this.ensureMember(
          conversationId,
          memberId,
          now,
          conversation.lastMessageSequence,
        ),
      ),
    );

    return {
      conversationId,
      members: await this.listMembers(conversationId, conversation.adminUserId),
      addedCount: results.filter(Boolean).length,
    };
  }

  async removeMember(
    actorId: string,
    conversationId: string,
    memberId: string,
  ) {
    const { conversation } = await this.requireAdministrator(
      actorId,
      conversationId,
    );
    if (conversation.kind !== GROUP_KIND) {
      throw new BadRequestException(
        'Membros só podem ser gerenciados em grupos.',
      );
    }
    this.validateObjectId(memberId, 'Participante');
    if (memberId === actorId) {
      throw new BadRequestException('Use a rota de saída para deixar o grupo.');
    }

    const target = await this.findMember(memberId, conversationId);
    if (!target) {
      throw new NotFoundException('Membro não encontrado.');
    }
    await this.removeMembership(conversationId, target._id);

    return {
      conversationId,
      members: await this.listMembers(conversationId, conversation.adminUserId),
      removedUserId: memberId,
    };
  }

  async leaveGroup(userId: string, conversationId: string) {
    const { conversation, membership } = await this.requireMembership(
      userId,
      conversationId,
    );
    if (conversation.kind !== GROUP_KIND) {
      throw new BadRequestException('Somente membros de grupos podem sair.');
    }

    const remaining = await db.orm.chat_members.where({ conversationId }).all();
    if (remaining.length <= 1) {
      throw new ConflictException(
        'Um grupo precisa manter ao menos um membro.',
      );
    }

    let adminUserId = conversation.adminUserId;
    if (adminUserId === userId) {
      const successor = remaining
        .filter((member) => member._id !== membership._id)
        .sort(
          (left, right) => left.joinedAt.getTime() - right.joinedAt.getTime(),
        )[0];
      if (!successor) {
        throw new ConflictException(
          'Não há outro membro para assumir a administração.',
        );
      }

      const transferred = await db.orm.chat_conversations
        .where({ _id: conversationId, adminUserId: userId })
        .update({ adminUserId: successor.userId });
      if (!transferred) {
        throw new ConflictException(
          'A administração foi transferida simultaneamente.',
        );
      }
      adminUserId = successor.userId;
    }

    await this.removeMembership(conversationId, membership._id);
    return {
      conversationId,
      left: true,
      members: await this.listMembers(conversationId, adminUserId),
      removedUserId: userId,
    };
  }

  private async removeMembership(conversationId: string, memberId: string) {
    await db.orm.chat_members.where({ _id: memberId, conversationId }).delete();
  }

  private async requireAdministrator(userId: string, conversationId: string) {
    const result = await this.requireMembership(userId, conversationId);
    if (
      result.conversation.kind !== GROUP_KIND ||
      result.conversation.adminUserId !== userId
    ) {
      throw new ForbiddenException(
        'Somente administradores do grupo podem gerenciar membros.',
      );
    }
    return result;
  }

  private async requireMembership(userId: string, conversationId: string) {
    this.validateObjectId(conversationId, 'Conversa');
    this.validateObjectId(userId, 'Usuário');

    const [conversation, membership] = await Promise.all([
      this.findConversation(conversationId),
      this.findMember(userId, conversationId),
    ]);
    if (!conversation || !membership) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    return { conversation, membership };
  }

  private async findConversation(id: string) {
    return db.orm.chat_conversations.where({ _id: id }).first();
  }

  private async findMember(userId: string, conversationId: string) {
    const memberId = this.deterministicId(`member:${conversationId}:${userId}`);
    return db.orm.chat_members
      .where({ _id: memberId, conversationId, userId })
      .first();
  }

  private async ensureMember(
    conversationId: string,
    userId: string,
    joinedAt: Date,
    lastReadSequence: number,
  ) {
    const id = this.deterministicId(`member:${conversationId}:${userId}`);
    const existing = await db.orm.chat_members.where({ _id: id }).first();
    if (existing) {
      if (
        existing.conversationId !== conversationId ||
        existing.userId !== userId
      ) {
        throw new ConflictException(
          'Conflito ao verificar o membro da conversa.',
        );
      }
      return false;
    }

    try {
      await db.orm.chat_members.create({
        _id: id,
        conversationId,
        userId,
        joinedAt,
        lastActivityAt: joinedAt,
        lastActivitySequence: lastReadSequence,
        lastReadSequence,
      });
      return true;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }
      const racedMember = await db.orm.chat_members.where({ _id: id }).first();
      if (
        !racedMember ||
        racedMember.conversationId !== conversationId ||
        racedMember.userId !== userId
      ) {
        throw error;
      }
      return false;
    }
  }

  private async assertUsersExist(userIds: string[]) {
    const users = await Promise.all(
      userIds.map((userId) => db.orm.users.where({ _id: userId }).first()),
    );
    if (users.some((user) => !user)) {
      throw new NotFoundException('Um ou mais usuários não foram encontrados.');
    }
  }

  private async listMembers(
    conversationId: string,
    adminUserId: string | null,
  ) {
    const memberships = await db.orm.chat_members
      .where({ conversationId })
      .orderBy({ joinedAt: 1 })
      .all();

    return Promise.all(
      memberships.map(async (membership) => {
        const user = await db.orm.users
          .where({ _id: membership.userId })
          .first();
        return {
          userId: membership.userId,
          name: user?.name ?? null,
          image: user?.image ?? null,
          role: membership.userId === adminUserId ? ADMIN_ROLE : MEMBER_ROLE,
          joinedAt: membership.joinedAt,
        };
      }),
    );
  }

  private async countUnread(
    conversationId: string,
    userId: string,
    lastReadSequence: number,
  ) {
    const plan = db.query
      .from('chat_messages')
      .match((fields) => fields.conversationId.eq(conversationId))
      .match((fields) => fields.senderId.ne(userId))
      .match((fields) => fields.sequence.gt(lastReadSequence))
      .group(() => ({ _id: null, unreadCount: acc.count() }))
      .build();

    const rows = await (await db.runtime()).query(plan);
    return rows[0]?.unreadCount ?? 0;
  }

  private async refreshConversationSummary(
    conversationId: string,
    message: {
      sequence: number;
      content: string;
      senderId: string;
      createdAt: Date;
    },
  ) {
    const updated = await db.orm.chat_conversations
      .where({ _id: conversationId })
      .where(MongoFieldFilter.lt('lastMessageSequence', message.sequence))
      .update({
        lastMessageSequence: message.sequence,
        lastMessageContent: message.content,
        lastMessageSenderId: message.senderId,
        lastMessageAt: message.createdAt,
        updatedAt: message.createdAt,
      });
    if (updated) {
      return updated;
    }

    const current = await this.findConversation(conversationId);
    if (!current || current.lastMessageSequence < message.sequence) {
      throw new ConflictException('A conversa foi atualizada simultaneamente.');
    }
    return current;
  }

  private async advanceMemberActivity(
    conversationId: string,
    sequence: number,
    activityAt: Date,
  ) {
    const members = await db.orm.chat_members.where({ conversationId }).all();
    await Promise.all(
      members.map((member) =>
        db.orm.chat_members
          .where({
            _id: member._id,
            lastActivitySequence: member.lastActivitySequence,
          })
          .where(MongoFieldFilter.lt('lastActivitySequence', sequence))
          .update({
            lastActivityAt: activityAt,
            lastActivitySequence: sequence,
          }),
      ),
    );
  }

  private assertSameMessageRequest(
    message: {
      conversationId: string;
      senderId: string;
      clientMessageId: string;
      content: string;
    },
    conversationId: string,
    senderId: string,
    clientMessageId: string,
    content: string,
  ) {
    if (
      message.conversationId !== conversationId ||
      message.senderId !== senderId ||
      message.clientMessageId !== clientMessageId ||
      message.content !== content
    ) {
      throw new ConflictException(
        'O identificador idempotente já foi utilizado.',
      );
    }
  }

  private toConversationResponse(conversation: {
    _id: string;
    kind: string;
    title: string | null;
    directKey: string | null;
    createdBy: string;
    adminUserId: string | null;
    sequence: number;
    lastMessageSequence: number;
    lastMessageContent: string | null;
    lastMessageSenderId: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: conversation._id,
      kind: conversation.kind,
      title: conversation.title,
      createdBy: conversation.createdBy,
      adminUserId: conversation.adminUserId,
      lastMessage: conversation.lastMessageAt
        ? {
            content: conversation.lastMessageContent,
            senderId: conversation.lastMessageSenderId,
            sequence: conversation.lastMessageSequence,
            createdAt: conversation.lastMessageAt,
          }
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessageResponse(message: {
    _id: string;
    conversationId: string;
    senderId: string;
    sequence: number;
    clientMessageId: string;
    content: string;
    createdAt: Date;
  }) {
    return {
      id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sequence: message.sequence,
      clientMessageId: message.clientMessageId,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  private parseLimit(value?: string) {
    const parsed = this.parsePositiveInteger(value, 'limit', false);
    return Math.min(parsed ?? DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
  }

  private parsePositiveInteger(
    value: string | undefined,
    name: string,
    allowUndefined: boolean,
  ) {
    if (value === undefined && allowUndefined) {
      return undefined;
    }
    if (!value || !/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`${name} deve ser um inteiro positivo.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(
        `${name} está fora do intervalo permitido.`,
      );
    }
    return parsed;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateObjectId(id: string, label: string) {
    if (!OBJECT_ID_PATTERN.test(id)) {
      throw new BadRequestException(`O identificador de ${label} é inválido.`);
    }
  }

  private deterministicId(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
