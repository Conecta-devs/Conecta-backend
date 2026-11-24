#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/134b3def7a3e8b93de07a1f4025a623dcc2583432c78acb82636f48187c513ec/contract';
import endContract from '../../snapshots/134b3def7a3e8b93de07a1f4025a623dcc2583432c78acb82636f48187c513ec/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/44d6dbad48eb52c5a2907db6cf4b292a417e49f7621838386ffcc25973d6fb7d/contract';
import startContract from '../../snapshots/44d6dbad48eb52c5a2907db6cf4b292a417e49f7621838386ffcc25973d6fb7d/contract.json' with { type: 'json' };
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
      createCollection('post_comments', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              authorId: { bsonType: 'objectId' },
              content: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
              postId: { bsonType: 'objectId' },
            },
            required: ['_id', 'authorId', 'content', 'createdAt', 'postId'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createCollection('post_likes', {
        validator: {
          $jsonSchema: {
            additionalProperties: false,
            bsonType: 'object',
            properties: {
              _id: { bsonType: 'objectId' },
              createdAt: { bsonType: 'date' },
              postId: { bsonType: 'objectId' },
              userId: { bsonType: 'objectId' },
            },
            required: ['_id', 'createdAt', 'postId', 'userId'],
          },
        },
        validationLevel: 'strict',
        validationAction: 'error',
      }),
      createIndex(
        'post_comments',
        [
          { direction: 1, field: 'postId' },
          { direction: 1, field: 'createdAt' },
        ],
        {},
      ),
      createIndex(
        'post_likes',
        [
          { direction: 1, field: 'postId' },
          { direction: 1, field: 'userId' },
        ],
        { unique: true },
      ),
    ];
  }
}

export default M;
MigrationCLI.run(import.meta.url, M);
