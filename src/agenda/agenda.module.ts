import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
