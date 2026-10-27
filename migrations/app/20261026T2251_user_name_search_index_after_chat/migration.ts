#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/44d6dbad48eb52c5a2907db6cf4b292a417e49f7621838386ffcc25973d6fb7d/contract';
import endContract from '../../snapshots/44d6dbad48eb52c5a2907db6cf4b292a417e49f7621838386ffcc25973d6fb7d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d68650468ff0b1100cfb52a73a345d0f8b9b3bf0f9d66bd071c5400bb90dd045/contract';
import startContract from '../../snapshots/d68650468ff0b1100cfb52a73a345d0f8b9b3bf0f9d66bd071c5400bb90dd045/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  createIndex,
} from '@prisma/orm-mongo/target/migration';

class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [createIndex('users', [{ direction: 1, field: 'name' }], {})];
  }
}

export default M;
MigrationCLI.run(import.meta.url, M);
