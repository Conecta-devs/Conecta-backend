import 'dotenv/config';
import mongo from '@prisma/orm-mongo/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const databaseUrl = process.env['DATABASE_URL']?.trim();

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be configured and point to the production MongoDB database',
  );
}

export const db = mongo<Contract>({
  contractJson,
  url: databaseUrl,
});
