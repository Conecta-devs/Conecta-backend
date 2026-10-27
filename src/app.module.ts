import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PostsModule } from './posts/posts.module.js';
import { AgendaModule } from './agenda/agenda.module.js';
import { ChatModule } from './chat/chat.module.js';
import { PrismaLifecycle } from './prisma/prisma-lifecycle.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'conecta-backend',
    }),
    AuthModule,
    PostsModule,
    AgendaModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaLifecycle],
})
export class AppModule {}
