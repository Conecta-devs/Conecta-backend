import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL precisa estar configurada no ambiente.');
}

const migrationUrl = new URL(
  '../migrations/app/20261026T2112_add_chat/ops.json',
  import.meta.url,
);
const operations = JSON.parse(await readFile(migrationUrl, 'utf8'));
const expectedOperationIds = [
  'collection.chat_conversations.create',
  'collection.chat_members.create',
  'collection.chat_messages.create',
  'index.chat_members.create(conversationId:1,userId:1)',
  'index.chat_members.create(userId:1,lastActivityAt:1)',
  'index.chat_messages.create(conversationId:1,sequence:1)',
  'index.chat_messages.create(conversationId:1,senderId:1,clientMessageId:1)',
];
const allowedCollections = new Set([
  'chat_conversations',
  'chat_members',
  'chat_messages',
]);

if (
  operations.length !== expectedOperationIds.length ||
  !expectedOperationIds.every((id) =>
    operations.some((operation) => operation.id === id),
  )
) {
  throw new Error(
    'O bundle de migração do chat não corresponde às operações esperadas.',
  );
}

const commands = operations.map((operation) => {
  if (operation.operationClass !== 'additive' || operation.execute.length !== 1) {
    throw new Error(`Operação não aditiva bloqueada: ${operation.id}`);
  }

  const command = operation.execute[0].command;
  if (
    !['createCollection', 'createIndex'].includes(command.kind) ||
    !allowedCollections.has(command.collection)
  ) {
    throw new Error(`Comando fora do escopo do chat bloqueado: ${operation.id}`);
  }

  return command;
});

const client = new MongoClient(databaseUrl);
try {
  await client.connect();
  const database = client.db();
  const existingCollections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );

  for (const command of commands) {
    if (command.kind !== 'createCollection') {
      continue;
    }

    if (existingCollections.has(command.collection)) {
      console.log(`Coleção existente preservada: ${command.collection}`);
      continue;
    }

    await database.createCollection(command.collection, {
      validator: command.validator,
      validationLevel: command.validationLevel,
      validationAction: command.validationAction,
    });
    existingCollections.add(command.collection);
    console.log(`Coleção criada: ${command.collection}`);
  }

  for (const command of commands) {
    if (command.kind !== 'createIndex') {
      continue;
    }

    const keys = Object.fromEntries(
      command.keys.map(({ field, direction }) => [field, direction]),
    );
    const options = { name: command.name };
    if (command.unique) {
      options.unique = true;
    }

    await database.collection(command.collection).createIndex(keys, options);
    console.log(`Índice garantido: ${command.name}`);
  }

  console.log('Configuração aditiva do MongoDB para o chat concluída.');
} finally {
  await client.close();
}
