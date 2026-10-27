#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/aff8b097fb36df8d3d26022fe7eec9bfb0c8c97ec35006d41b0b491d2b58d598/contract';
import startContract from '../../snapshots/aff8b097fb36df8d3d26022fe7eec9bfb0c8c97ec35006d41b0b491d2b58d598/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d68650468ff0b1100cfb52a73a345d0f8b9b3bf0f9d66bd071c5400bb90dd045/contract';
import endContract from '../../snapshots/d68650468ff0b1100cfb52a73a345d0f8b9b3bf0f9d66bd071c5400bb90dd045/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  createCollection,
  createIndex,
} from '@prisma/orm-mongo/target/migration';

class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      createCollection('chat_conversations', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              adminUserId: { bsonType: ['null', 'objectId'] },
              createdAt: { bsonType: 'date' },
              createdBy: { bsonType: 'objectId' },
              directKey: { bsonType: ['null', 'string'] },
              kind: { bsonType: 'string' },
              lastMessageAt: { bsonType: ['null', 'date'] },
              lastMessageContent: { bsonType: ['null', 'string'] },
              lastMessageSenderId: { bsonType: ['null', 'objectId'] },
              lastMessageSequence: { bsonType: 'int' },
              sequence: { bsonType: 'int' },
              title: { bsonType: ['null', 'string'] },
              updatedAt: { bsonType: 'date' },
            },
            required: [
              '_id',
              'createdAt',
              'createdBy',
              'kind',
              'lastMessageSequence',
              'sequence',
              'updatedAt',
            ],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('chat_members', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              conversationId: { bsonType: 'objectId' },
              joinedAt: { bsonType: 'date' },
              lastActivityAt: { bsonType: 'date' },
              lastActivitySequence: { bsonType: 'int' },
              lastReadSequence: { bsonType: 'int' },
              userId: { bsonType: 'objectId' },
            },
            required: [
              '_id',
              'conversationId',
              'joinedAt',
              'lastActivityAt',
              'lastActivitySequence',
              'lastReadSequence',
              'userId',
            ],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('chat_messages', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              clientMessageId: { bsonType: 'string' },
              content: { bsonType: 'string' },
              conversationId: { bsonType: 'objectId' },
              createdAt: { bsonType: 'date' },
              senderId: { bsonType: 'objectId' },
              sequence: { bsonType: 'int' },
            },
            required: [
              '_id',
              'clientMessageId',
              'content',
              'conversationId',
              'createdAt',
              'senderId',
              'sequence',
            ],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createIndex(
        'chat_members',
        [
          { direction: 1, field: 'conversationId' },
          { direction: 1, field: 'userId' },
        ],
        { unique: true },
      ),
      createIndex(
        'chat_members',
        [
          { direction: 1, field: 'userId' },
          { direction: 1, field: 'lastActivityAt' },
        ],
        {},
      ),
      createIndex(
        'chat_messages',
        [
          { direction: 1, field: 'conversationId' },
          { direction: 1, field: 'sequence' },
        ],
        { unique: true },
      ),
      createIndex(
        'chat_messages',
        [
          { direction: 1, field: 'conversationId' },
          { direction: 1, field: 'senderId' },
          { direction: 1, field: 'clientMessageId' },
        ],
        { unique: true },
      ),
    ];
  }
}

export default M;
MigrationCLI.run(import.meta.url, M);
