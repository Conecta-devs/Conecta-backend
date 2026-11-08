#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/aff8b097fb36df8d3d26022fe7eec9bfb0c8c97ec35006d41b0b491d2b58d598/contract';
import endContract from '../../snapshots/aff8b097fb36df8d3d26022fe7eec9bfb0c8c97ec35006d41b0b491d2b58d598/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  createCollection,
  createIndex,
} from '@prisma/orm-mongo/target/migration';

class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      createCollection('agenda_items', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              cancelledAt: { bsonType: ['null', 'date'] },
              createdAt: { bsonType: 'date' },
              description: { bsonType: 'string' },
              endsAt: { bsonType: 'date' },
              format: { bsonType: 'string' },
              kind: { bsonType: 'string' },
              location: { bsonType: ['null', 'string'] },
              meetingUrl: { bsonType: ['null', 'string'] },
              organizerId: { bsonType: 'objectId' },
              startsAt: { bsonType: 'date' },
              title: { bsonType: 'string' },
              updatedAt: { bsonType: 'date' },
            },
            required: [
              '_id',
              'createdAt',
              'description',
              'endsAt',
              'format',
              'kind',
              'organizerId',
              'startsAt',
              'title',
              'updatedAt',
            ],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('agenda_participations', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              agendaItemId: { bsonType: 'objectId' },
              confirmed: { bsonType: 'bool' },
              createdAt: { bsonType: 'date' },
              interested: { bsonType: 'bool' },
              updatedAt: { bsonType: 'date' },
              userId: { bsonType: 'objectId' },
            },
            required: [
              '_id',
              'agendaItemId',
              'confirmed',
              'createdAt',
              'interested',
              'updatedAt',
              'userId',
            ],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('password_reset_tokens', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              consumedAt: { bsonType: ['null', 'date'] },
              expiresAt: { bsonType: 'date' },
              tokenHash: { bsonType: 'string' },
              userId: { bsonType: 'objectId' },
            },
            required: ['_id', 'expiresAt', 'tokenHash', 'userId'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('posts', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              authorId: { bsonType: 'objectId' },
              content: { bsonType: ['null', 'string'] },
              title: { bsonType: 'string' },
            },
            required: ['_id', 'authorId', 'title'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('sessions', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              authVersion: { bsonType: ['null', 'int'] },
              expiresAt: { bsonType: 'date' },
              revokedAt: { bsonType: ['null', 'date'] },
              tokenHash: { bsonType: 'string' },
              userId: { bsonType: 'objectId' },
            },
            required: ['_id', 'expiresAt', 'tokenHash', 'userId'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('users', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              authVersion: { bsonType: ['null', 'int'] },
              bio: { bsonType: ['null', 'string'] },
              email: { bsonType: 'string' },
              gen: { bsonType: ['null', 'string'] },
              image: { bsonType: ['null', 'string'] },
              name: { bsonType: 'string' },
              passwordHash: { bsonType: 'string' },
              permissao: { bsonType: ['null', 'string'] },
            },
            required: ['_id', 'email', 'name', 'passwordHash'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createIndex(
        'agenda_participations',
        [
          { direction: 1, field: 'agendaItemId' },
          { direction: 1, field: 'userId' },
        ],
        { unique: true },
      ),
      createIndex('password_reset_tokens', [{ direction: 1, field: 'userId' }], { unique: true }),
      createIndex('password_reset_tokens', [{ direction: 1, field: 'tokenHash' }], {
        unique: true,
      }),
      createIndex('sessions', [{ direction: 1, field: 'tokenHash' }], { unique: true }),
      createIndex('users', [{ direction: 1, field: 'email' }], { unique: true }),
    ];
  }
}

export default M;
MigrationCLI.run(import.meta.url, M);
