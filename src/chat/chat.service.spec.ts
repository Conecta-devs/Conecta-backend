import { createHash } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const collections: Record<string, Array<Record<string, unknown>>> = {};

  const valuesEqual = (left: unknown, right: unknown) => {
    if (right === null) {
      return left === null || left === undefined;
    }
    return left === right;
  };

  const matches = (document: Record<string, unknown>, filters: unknown[]) =>
    filters.every((filter) => {
      if (
        typeof filter === 'object' &&
        filter !== null &&
        'kind' in filter &&
        filter.kind === 'field' &&
        'field' in filter &&
        'op' in filter &&
        'value' in filter
      ) {
        const field = filter.field as string;
        const value = filter.value;
        const actual = document[field];
        switch (filter.op) {
          case '$eq':
            return valuesEqual(actual, value);
          case '$gt':
            return (actual as number) > (value as number);
          case '$lt':
            return (actual as number) < (value as number);
          case '$regex':
            return (
              typeof actual === 'string' &&
              typeof value === 'string' &&
              new RegExp(value).test(actual)
            );
          case '$neq':
          case '$ne':
            return !valuesEqual(actual, value);
          default:
            return false;
        }
      }

      return (
        typeof filter === 'object' &&
        filter !== null &&
        Object.entries(filter).every(([key, value]) =>
          valuesEqual(document[key], value),
        )
      );
    });

  const applyChanges = (
    document: Record<string, unknown>,
    changes:
      | Record<string, unknown>
      | ((fields: Record<string, unknown>) => Array<Record<string, unknown>>),
  ) => {
    if (typeof changes !== 'function') {
      Object.assign(document, changes);
      return;
    }

    const fields = new Proxy(
      {},
      {
        get: (_target, field) => ({
          inc: (value: number) => ({
            field,
            operator: '$inc',
            value,
          }),
          set: (value: unknown) => ({
            field,
            operator: '$set',
            value,
          }),
        }),
      },
    ) as Record<string, unknown>;
    for (const operation of changes(fields)) {
      const key = operation.field as string;
      if (operation.operator === '$inc') {
        document[key] =
          ((document[key] as number | undefined) ?? 0) +
          (operation.value as number);
      } else {
        document[key] = operation.value;
      }
    }
  };

  class Query {
    private filters: unknown[];
    private sort: Record<string, 1 | -1> | undefined;
    private take: number | undefined;
    private skip = 0;
    private selectedFields: string[] | undefined;

    constructor(
      private readonly collectionName: string,
      filters: unknown[],
    ) {
      this.filters = filters;
    }

    where(filter: unknown) {
      this.filters = [...this.filters, filter];
      return this;
    }

    orderBy(sort: Record<string, 1 | -1>) {
      this.sort = sort;
      return this;
    }

    select(...fields: string[]) {
      this.selectedFields = fields;
      return this;
    }

    limit(take: number) {
      this.take = take;
      return this;
    }

    offset(skip: number) {
      this.skip = skip;
      return this;
    }

    async first() {
      return this.documents()[0] ?? null;
    }

    async all() {
      return this.documents();
    }

    async update(changes: Parameters<typeof applyChanges>[1]) {
      const document = this.documents()[0];
      if (!document) {
        return null;
      }
      applyChanges(document, changes);
      return document;
    }

    async updateAndCount(changes: Parameters<typeof applyChanges>[1]) {
      const documents = this.documents();
      for (const document of documents) {
        applyChanges(document, changes);
      }
      return documents.length;
    }

    async delete() {
      const documents = collections[this.collectionName] ?? [];
      const documentIndex = documents.findIndex((document) =>
        matches(document, this.filters),
      );
      if (documentIndex < 0) {
        return null;
      }
      return documents.splice(documentIndex, 1)[0] ?? null;
    }

    private documents() {
      let result = (collections[this.collectionName] ?? []).filter((document) =>
        matches(document, this.filters),
      );
      if (this.sort) {
        const sortFields = Object.entries(this.sort);
        result = [...result].sort((left, right) => {
          for (const [field, direction] of sortFields) {
            const a = left[field] as number | Date | string;
            const b = right[field] as number | Date | string;
            const first = a instanceof Date ? a.getTime() : a;
            const second = b instanceof Date ? b.getTime() : b;
            if (first !== second) {
              return first < second ? -direction : direction;
            }
          }
          return 0;
        });
      }
      result = result.slice(this.skip);
      if (this.take !== undefined) {
        result = result.slice(0, this.take);
      }
      if (!this.selectedFields) {
        return result;
      }
      return result.map((document) =>
        Object.fromEntries(
          this.selectedFields!.filter((field) => field in document).map(
            (field) => [field, document[field]],
          ),
        ),
      );
    }
  }

  const makeCollection = (name: string) => ({
    where: (filter: unknown) => new Query(name, [filter]),
    create: async (document: Record<string, unknown>) => {
      const documents = (collections[name] ??= []);
      if (documents.some((item) => item._id === document._id)) {
        throw { code: 11000 };
      }
      documents.push(document);
      return document;
    },
  });

  const database = {
    orm: {
      users: makeCollection('users'),
      chat_conversations: makeCollection('chat_conversations'),
      chat_members: makeCollection('chat_members'),
      chat_messages: makeCollection('chat_messages'),
    },
    query: {
      from: () => {
        const filters: unknown[] = [];
        const builder = {
          match: (
            buildFilter: (fields: Record<string, unknown>) => unknown,
          ) => {
            const fields = new Proxy(
              {},
              {
                get: (_target, field) => ({
                  eq: (value: unknown) => ({
                    kind: 'field',
                    field,
                    op: '$eq',
                    value,
                  }),
                  ne: (value: unknown) => ({
                    kind: 'field',
                    field,
                    op: '$neq',
                    value,
                  }),
                  gt: (value: unknown) => ({
                    kind: 'field',
                    field,
                    op: '$gt',
                    value,
                  }),
                }),
              },
            ) as Record<string, unknown>;
            filters.push(buildFilter(fields));
            return builder;
          },
          group: () => builder,
          build: () => filters,
        };
        return builder;
      },
    },
    runtime: async () => ({
      query: async (filters: unknown[]) => {
        const count = (collections.chat_messages ?? []).filter((message) =>
          matches(message, filters),
        ).length;
        return count ? [{ _id: null, unreadCount: count }] : [];
      },
    }),
  };

  return { collections, database };
});

vi.mock('../prisma/db.js', () => ({ db: mockState.database }));

import { ChatService } from './chat.service.js';

const aliceId = '65f1234567890abcdef12345';
const bobId = '65f1234567890abcdef12346';
const conversationId = '65f1234567890abcdef12347';
const memberId = (conversation: string, user: string) =>
  createHash('sha256')
    .update(`member:${conversation}:${user}`)
    .digest('hex')
    .slice(0, 24);

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    for (const collection of Object.values(mockState.collections)) {
      collection.length = 0;
    }
    service = new ChatService();
  });

  it('returns only public user fields, excludes self, searches by literal name prefix and paginates', async () => {
    mockState.collections.users = [
      {
        _id: aliceId,
        name: 'Alice',
        image: null,
        email: 'alice@example.com',
        passwordHash: 'secret-hash',
      },
      {
        _id: bobId,
        name: 'Bruna Silva',
        image: 'bruna.png',
        email: 'bruna@example.com',
        passwordHash: 'secret-hash',
      },
      {
        _id: '65f1234567890abcdef12348',
        name: 'Bruno Souza',
        email: 'bruno@example.com',
        passwordHash: 'secret-hash',
      },
      {
        _id: '65f1234567890abcdef12349',
        name: 'Br.una Literal',
        image: null,
        email: 'literal@example.com',
        passwordHash: 'secret-hash',
      },
    ];

    const firstPage = await service.discoverUsers(aliceId, {
      search: 'Bru',
      page: '1',
      limit: '1',
    });
    const secondPage = await service.discoverUsers(aliceId, {
      search: 'Bru',
      page: '2',
      limit: '1',
    });
    const escapedSearch = await service.discoverUsers(aliceId, {
      search: 'Br.',
      limit: '50',
    });

    expect(firstPage).toEqual({
      users: [{ id: bobId, name: 'Bruna Silva', image: 'bruna.png' }],
      page: 1,
      limit: 1,
      hasMore: true,
    });
    expect(secondPage.users).toEqual([
      { id: '65f1234567890abcdef12348', name: 'Bruno Souza', image: null },
    ]);
    expect(typeof firstPage.page).toBe('number');
    expect(typeof firstPage.limit).toBe('number');
    expect(typeof firstPage.hasMore).toBe('boolean');
    expect(escapedSearch.users).toEqual([
      { id: '65f1234567890abcdef12349', name: 'Br.una Literal', image: null },
    ]);
    expect(firstPage.users.every((user) => typeof user.id === 'string')).toBe(
      true,
    );
    expect(firstPage.users.every((user) => typeof user.name === 'string')).toBe(
      true,
    );
    expect(firstPage.users.map((user) => user.id)).not.toContain(aliceId);
    expect(JSON.stringify(firstPage)).not.toContain('passwordHash');
    expect(JSON.stringify(firstPage)).not.toContain('email');
  });

  it('returns an empty users array and numeric pagination metadata when no users match', async () => {
    mockState.collections.users = [
      { _id: aliceId, name: 'Alice', image: null },
      { _id: bobId, name: 'Bruna', image: null },
    ];

    const result = await service.discoverUsers(aliceId, {
      search: 'No match',
    });

    expect(result).toEqual({
      users: [],
      page: 1,
      limit: 24,
      hasMore: false,
    });
    expect(Array.isArray(result.users)).toBe(true);
    expect(typeof result.page).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.hasMore).toBe('boolean');
  });

  it('caps user discovery results and rejects pages that would cause excessive offsets', async () => {
    const capped = await service.discoverUsers(aliceId, { limit: '999' });
    expect(capped.limit).toBe(50);

    await expect(
      service.discoverUsers(aliceId, { page: '1001' }),
    ).rejects.toThrow('A página está fora do intervalo permitido.');
  });

  it('creates one direct conversation for repeated and concurrent requests', async () => {
    mockState.collections.users = [{ _id: aliceId }, { _id: bobId }];

    const [first, second] = await Promise.all([
      service.createOrGetDirectConversation(aliceId, bobId),
      service.createOrGetDirectConversation(bobId, aliceId),
    ]);

    expect(first.id).toBe(second.id);
    expect(mockState.collections.chat_conversations).toHaveLength(1);
    expect(mockState.collections.chat_members).toHaveLength(2);
  });

  it('does not disclose conversations to non-members', async () => {
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'group',
        title: 'private',
        directKey: null,
        createdBy: aliceId,
        adminUserId: null,
        sequence: 0,
        lastMessageSequence: 0,
        lastMessageContent: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await expect(
      service.getConversation(bobId, conversationId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockState.collections.chat_messages).toBeUndefined();
  });

  it('persists one idempotent message and counts only other members as unread', async () => {
    const now = new Date();
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'group',
        title: 'study',
        directKey: null,
        createdBy: aliceId,
        adminUserId: null,
        sequence: 0,
        lastMessageSequence: 0,
        lastMessageContent: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockState.collections.chat_members = [
      {
        _id: memberId(conversationId, aliceId),
        conversationId,
        userId: aliceId,
        role: 'admin',
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 0,
        lastReadSequence: 0,
      },
      {
        _id: memberId(conversationId, bobId),
        conversationId,
        userId: bobId,
        role: 'member',
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 0,
        lastReadSequence: 0,
      },
    ];
    const dto = {
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: '  hello  ',
    };

    const first = await service.sendMessage(aliceId, conversationId, dto);
    const retry = await service.sendMessage(aliceId, conversationId, dto);

    expect(first.message.content).toBe('hello');
    expect(first.message.sequence).toBe(1);
    expect(first.unreadUpdates).toEqual([{ userId: bobId, unreadCount: 1 }]);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(mockState.collections.chat_messages).toHaveLength(1);
  });

  it('marks messages through the persisted cursor as read, excluding own messages', async () => {
    const now = new Date();
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'direct',
        title: null,
        directKey: `${aliceId}:${bobId}`,
        createdBy: aliceId,
        adminUserId: null,
        sequence: 3,
        lastMessageSequence: 3,
        lastMessageContent: 'latest',
        lastMessageSenderId: bobId,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockState.collections.chat_members = [
      {
        _id: memberId(conversationId, bobId),
        conversationId,
        userId: bobId,
        role: 'member',
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 3,
        lastReadSequence: 0,
      },
    ];
    mockState.collections.chat_messages = [
      {
        _id: memberId(conversationId, aliceId),
        conversationId,
        senderId: bobId,
        sequence: 1,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440001',
        content: 'own',
        createdAt: now,
      },
      {
        _id: '265f1234567890abcdef12346',
        conversationId,
        senderId: aliceId,
        sequence: 2,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440002',
        content: 'received',
        createdAt: now,
      },
      {
        _id: '365f1234567890abcdef12346',
        conversationId,
        senderId: aliceId,
        sequence: 3,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440003',
        content: 'latest',
        createdAt: now,
      },
    ];

    const result = await service.markRead(bobId, conversationId);

    expect(result.lastReadSequence).toBe(3);
    expect(result.unreadCount).toBe(0);
  });

  it('returns stable cursor pages in chronological order', async () => {
    const now = new Date();
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'direct',
        title: null,
        directKey: `${aliceId}:${bobId}`,
        createdBy: aliceId,
        adminUserId: null,
        sequence: 4,
        lastMessageSequence: 4,
        lastMessageContent: 'four',
        lastMessageSenderId: aliceId,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockState.collections.chat_members = [
      {
        _id: memberId(conversationId, aliceId),
        conversationId,
        userId: aliceId,
        role: 'member',
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 4,
        lastReadSequence: 0,
      },
    ];
    mockState.collections.chat_messages = [1, 2, 3, 4].map((sequence) => ({
      _id: `${sequence}`.padStart(24, '0'),
      conversationId,
      senderId: bobId,
      sequence,
      clientMessageId: `550e8400-e29b-41d4-a716-44665544000${sequence}`,
      content: `${sequence}`,
      createdAt: now,
    }));

    const result = await service.getHistory(aliceId, conversationId, '4', '2');

    expect(result.messages.map((message) => message.sequence)).toEqual([2, 3]);
    expect(result.nextCursor).toBe('2');
  });

  it('rejects member administration by non-administrators', async () => {
    const now = new Date();
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'group',
        title: 'study',
        directKey: null,
        createdBy: aliceId,
        adminUserId: aliceId,
        sequence: 0,
        lastMessageSequence: 0,
        lastMessageContent: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockState.collections.chat_members = [
      {
        _id: memberId(conversationId, bobId),
        conversationId,
        userId: bobId,
        role: 'member',
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 0,
        lastReadSequence: 0,
      },
    ];

    await expect(
      service.addMembers(bobId, conversationId, { memberIds: [aliceId] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transfers group administration atomically when the administrator leaves', async () => {
    const now = new Date();
    mockState.collections.users = [
      { _id: aliceId, name: 'Alice', image: null },
      { _id: bobId, name: 'Bob', image: null },
    ];
    mockState.collections.chat_conversations = [
      {
        _id: conversationId,
        kind: 'group',
        title: 'study',
        directKey: null,
        createdBy: aliceId,
        adminUserId: aliceId,
        sequence: 0,
        lastMessageSequence: 0,
        lastMessageContent: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockState.collections.chat_members = [
      {
        _id: memberId(conversationId, aliceId),
        conversationId,
        userId: aliceId,
        joinedAt: now,
        lastActivityAt: now,
        lastActivitySequence: 0,
        lastReadSequence: 0,
      },
      {
        _id: memberId(conversationId, bobId),
        conversationId,
        userId: bobId,
        joinedAt: new Date(now.getTime() + 1),
        lastActivityAt: now,
        lastActivitySequence: 0,
        lastReadSequence: 0,
      },
    ];

    const result = await service.leaveGroup(aliceId, conversationId);

    expect(result.removedUserId).toBe(aliceId);
    expect(result.members).toEqual([
      expect.objectContaining({ userId: bobId, role: 'admin' }),
    ]);
    expect(mockState.collections.chat_conversations[0]?.adminUserId).toBe(
      bobId,
    );
    expect(mockState.collections.chat_members).toHaveLength(1);
  });
});
