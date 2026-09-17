import 'dotenv/config';
import mongo from '@prisma/orm-mongo/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const databaseUrl =
  process.env['DATABASE_URL'] ?? 'mongodb://localhost:27017/conecta-backend';

export const db = mongo<Contract>({
  contractJson,
  url: databaseUrl,
});
