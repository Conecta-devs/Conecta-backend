import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { db } from './db.js';

@Injectable()
export class PrismaLifecycle implements OnApplicationShutdown {
  onApplicationShutdown() {
    return db.close();
  }
}
