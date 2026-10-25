import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard.js';
import { AgendaService } from './agenda.service.js';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto.js';
import {
  UpdateParticipationAttendanceDto,
  UpdateParticipationInterestDto,
} from './dto/participation.dto.js';
import { UpdateAgendaItemDto } from './dto/update-agenda-item.dto.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    name: string;
  };
};

@Controller('agenda')
@UseGuards(JwtAuthGuard)
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  findAll() {
    return this.agendaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agendaService.findOne(id);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAgendaItemDto,
  ) {
    return this.agendaService.create(request.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAgendaItemDto,
  ) {
    return this.agendaService.update(id, request.user.sub, dto);
  }

  @Patch(':id/cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.agendaService.cancel(id, request.user.sub);
  }

  @Get(':id/participation/me')
  getMyParticipation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.agendaService.getMyParticipation(id, request.user.sub);
  }

  @Put(':id/participation/interest')
  updateMyInterest(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateParticipationInterestDto,
  ) {
    return this.agendaService.updateMyInterest(id, request.user.sub, dto.interested);
  }

  @Put(':id/participation/attendance')
  updateMyAttendance(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateParticipationAttendanceDto,
  ) {
    return this.agendaService.updateMyAttendance(id, request.user.sub, dto.confirmed);
  }
}
