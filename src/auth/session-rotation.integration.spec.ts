import { randomBytes } from 'node:crypto';
import mongo from '@prisma/orm-mongo/runtime';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast/execution';
import type { Contract } from '../prisma/contract.d.js';
import contractJson from '../prisma/contract.json' with { type: 'json' };

const mongoTestUrl = process.env.MONGODB_TEST_URL;

if (!mongoTestUrl) {
  describe.skip('MongoDB session rotation integration', () => {
    it('requires MONGODB_TEST_URL to run against an isolated MongoDB test database', () => {});
  });
} else {
  describe('MongoDB session rotation integration', () => {
    it('allows at most one concurrent conditional update for the same refresh token', async () => {
      const testDb = mongo<Contract>({
        contractJson,
        url: mongoTestUrl,
      });
      const originalHash = randomBytes(32).toString('hex');
      const replacementHashes = [
        randomBytes(32).toString('hex'),
        randomBytes(32).toString('hex'),
      ];
      const sessionId = randomBytes(12).toString('hex');
      const expiresAt = new Date(Date.now() + 60_000);
      const nextExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      try {
        await testDb.orm.sessions.create({
          _id: sessionId,
          userId: randomBytes(12).toString('hex'),
          tokenHash: originalHash,
          expiresAt,
          revokedAt: null,
        });

        const rotations = await Promise.all(
          replacementHashes.map((tokenHash) =>
            testDb.orm.sessions
              .where({ tokenHash: originalHash })
              .where(MongoFieldFilter.isNull('revokedAt'))
              .where(MongoFieldFilter.gt('expiresAt', new Date()))
              .update({
                tokenHash,
                expiresAt: nextExpiresAt,
              }),
          ),
        );

        expect(rotations.filter(Boolean)).toHaveLength(1);
        expect(
          await testDb.orm.sessions
            .where({ tokenHash: originalHash })
            .first(),
        ).toBeNull();
      } finally {
        await testDb.orm.sessions.where({ _id: sessionId }).delete();
        await testDb.close();
      }
    });

    it('revokes a session when logout races with token rotation', async () => {
      const testDb = mongo<Contract>({
        contractJson,
        url: mongoTestUrl,
      });
      const sessionId = randomBytes(12).toString('hex');
      const originalHash = randomBytes(32).toString('hex');
      const replacementHash = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60_000);

      try {
        await testDb.orm.sessions.create({
          _id: sessionId,
          userId: randomBytes(12).toString('hex'),
          tokenHash: originalHash,
          expiresAt,
          revokedAt: null,
        });

        const [rotation] = await Promise.all([
          testDb.orm.sessions
            .where({ _id: sessionId, tokenHash: originalHash })
            .where(MongoFieldFilter.isNull('revokedAt'))
            .where(MongoFieldFilter.gt('expiresAt', new Date()))
            .update({
              tokenHash: replacementHash,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }),
          testDb.orm.sessions
            .where({ _id: sessionId })
            .where(MongoFieldFilter.isNull('revokedAt'))
            .update({ revokedAt: new Date() }),
        ]);

        const session = await testDb.orm.sessions
          .where({ _id: sessionId })
          .first();

        expect(session?.revokedAt).toBeInstanceOf(Date);
        if (rotation) {
          expect(session?.tokenHash).toBe(replacementHash);
        }
      } finally {
        await testDb.orm.sessions.where({ _id: sessionId }).delete();
        await testDb.close();
      }
    });
  });
}
