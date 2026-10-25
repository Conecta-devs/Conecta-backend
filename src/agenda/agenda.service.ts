import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast/execution';
import { db } from '../prisma/db.js';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto.js';
import type {
  UpdateParticipationAttendanceDto,
  UpdateParticipationInterestDto,
} from './dto/participation.dto.js';
import { UpdateAgendaItemDto } from './dto/update-agenda-item.dto.js';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

@Injectable()
export class AgendaService {
  async findAll() {
    const items = await db.orm.agenda_items
      .where(MongoFieldFilter.isNull('cancelledAt'))
      .orderBy({ startsAt: 1 })
      .all();

    return items.map((item) => this.toResponse(item));
  }

  async findOne(id: string) {
    this.validateId(id);

    const item = await db.orm.agenda_items
      .where({ _id: id })
      .where(MongoFieldFilter.isNull('cancelledAt'))
      .first();

    if (!item) {
      throw new NotFoundException('Encontro não encontrado.');
    }

    return this.toResponse(item);
  }

  async create(organizerId: string, dto: CreateAgendaItemDto) {
    const title = dto.title.trim();
    const description = dto.description.trim();
    if (!title || !description) {
      throw new BadRequestException('Título e descrição são obrigatórios.');
    }

    const startsAt = this.parseDate(dto.startsAt, 'startsAt');
    const endsAt = this.parseDate(dto.endsAt, 'endsAt');
    this.validateDateOrder(startsAt, endsAt);
    const { meetingUrl, location } = this.validateFormat(
      dto.format,
      dto.meetingUrl,
      dto.location,
    );
    const now = new Date();

    const item = await db.orm.agenda_items.create({
      title,
      description,
      kind: dto.kind,
      format: dto.format,
      startsAt,
      endsAt,
      meetingUrl,
      location,
      organizerId,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return this.toResponse(item);
  }

  async update(id: string, organizerId: string, dto: UpdateAgendaItemDto) {
    this.validateId(id);
    const current = await db.orm.agenda_items.where({ _id: id }).first();

    if (!current) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    if (current.organizerId !== organizerId) {
      throw new ForbiddenException('Somente o organizador pode editar o encontro.');
    }
    if (current.cancelledAt != null) {
      throw new ConflictException('Encontros cancelados não podem ser editados.');
    }

    const title = dto.title?.trim();
    const description = dto.description?.trim();
    if (title === '' || description === '') {
      throw new BadRequestException('Título e descrição não podem ficar vazios.');
    }

    const startsAt =
      dto.startsAt === undefined
        ? current.startsAt
        : this.parseDate(dto.startsAt, 'startsAt');
    const endsAt =
      dto.endsAt === undefined
        ? current.endsAt
        : this.parseDate(dto.endsAt, 'endsAt');
    this.validateDateOrder(startsAt, endsAt);

    const format = dto.format ?? current.format;
    const { meetingUrl, location } = this.validateFormat(
      format,
      dto.meetingUrl === undefined ? current.meetingUrl : dto.meetingUrl,
      dto.location === undefined ? current.location : dto.location,
    );
    const updatedAt = new Date(
      Math.max(Date.now(), current.updatedAt.getTime() + 1),
    );

    const updated = await db.orm.agenda_items
      .where({ _id: id, organizerId, updatedAt: current.updatedAt })
      .where(MongoFieldFilter.isNull('cancelledAt'))
      .update({
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt } : {}),
        ...(dto.meetingUrl !== undefined ? { meetingUrl } : {}),
        ...(dto.location !== undefined ? { location } : {}),
        updatedAt,
      });

    if (!updated) {
      throw new ConflictException('O encontro foi alterado ou cancelado simultaneamente.');
    }

    return this.toResponse(updated);
  }

  async cancel(id: string, organizerId: string) {
    this.validateId(id);
    const current = await db.orm.agenda_items.where({ _id: id }).first();

    if (!current) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    if (current.organizerId !== organizerId) {
      throw new ForbiddenException('Somente o organizador pode cancelar o encontro.');
    }
    if (current.cancelledAt != null) {
      throw new ConflictException('O encontro já foi cancelado.');
    }

    const now = new Date();
    const cancelled = await db.orm.agenda_items
      .where({ _id: id, organizerId })
      .where(MongoFieldFilter.isNull('cancelledAt'))
      .update({
        cancelledAt: now,
        updatedAt: now,
      });

    if (!cancelled) {
      throw new ConflictException('O encontro foi alterado ou cancelado simultaneamente.');
    }

    return this.toResponse(cancelled);
  }

  async getMyParticipation(agendaItemId: string, userId: string) {
    await this.findActiveAgendaItem(agendaItemId);

    const participation = await db.orm.agenda_participations
      .where({ agendaItemId, userId })
      .first();

    if (!participation) {
      return {
        id: null,
        agendaItemId,
        userId,
        interested: false,
        confirmed: false,
        createdAt: null,
        updatedAt: null,
      };
    }

    return this.toParticipationResponse(participation);
  }

  async updateMyInterest(
    agendaItemId: string,
    userId: string,
    interested: UpdateParticipationInterestDto['interested'],
  ) {
    await this.findActiveAgendaItem(agendaItemId);
    const now = new Date();

    const participation = await db.orm.agenda_participations
      .where({ agendaItemId, userId })
      .upsert({
        create: {
          agendaItemId,
          userId,
          interested,
          confirmed: false,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          interested,
          updatedAt: now,
        },
      });

    return this.toParticipationResponse(participation);
  }

  async updateMyAttendance(
    agendaItemId: string,
    userId: string,
    confirmed: UpdateParticipationAttendanceDto['confirmed'],
  ) {
    await this.findActiveAgendaItem(agendaItemId);
    const now = new Date();

    const participation = await db.orm.agenda_participations
      .where({ agendaItemId, userId })
      .upsert({
        create: {
          agendaItemId,
          userId,
          interested: false,
          confirmed,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          confirmed,
          updatedAt: now,
        },
      });

    return this.toParticipationResponse(participation);
  }

  private async findActiveAgendaItem(id: string) {
    this.validateId(id);

    const item = await db.orm.agenda_items
      .where({ _id: id })
      .where(MongoFieldFilter.isNull('cancelledAt'))
      .first();

    if (!item) {
      throw new NotFoundException('Encontro não encontrado.');
    }

    return item;
  }

  private validateId(id: string) {
    if (!OBJECT_ID_PATTERN.test(id)) {
      throw new BadRequestException('O identificador do encontro é inválido.');
    }
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException(`${field} deve ser uma data válida.`);
    }
    return date;
  }

  private validateDateOrder(startsAt: Date, endsAt: Date) {
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt deve ser posterior a startsAt.');
    }
  }

  private validateFormat(
    format: string,
    meetingUrl?: string | null,
    location?: string | null,
  ) {
    const normalizedLocation = location?.trim() || null;
    const normalizedMeetingUrl = meetingUrl?.trim() || null;

    if (format === 'online' && normalizedLocation) {
      throw new BadRequestException('Encontros online não devem informar localização.');
    }
    if (format === 'in_person' && !normalizedLocation) {
      throw new BadRequestException('Informe a localização do encontro presencial.');
    }
    if (format === 'in_person' && normalizedMeetingUrl) {
      throw new BadRequestException('Encontros presenciais não devem informar URL de reunião.');
    }

    return {
      meetingUrl: normalizedMeetingUrl,
      location: normalizedLocation,
    };
  }

  private toResponse(item: {
    _id: string;
    title: string;
    description: string;
    kind: string;
    format: string;
    startsAt: Date;
    endsAt: Date;
    meetingUrl: string | null;
    location: string | null;
    organizerId: string;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: item._id,
      title: item.title,
      description: item.description,
      kind: item.kind,
      format: item.format,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      meetingUrl: item.meetingUrl,
      location: item.location,
      organizerId: item.organizerId,
      cancelledAt: item.cancelledAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toParticipationResponse(participation: {
    _id: string;
    agendaItemId: string;
    userId: string;
    interested: boolean;
    confirmed: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: participation._id,
      agendaItemId: participation.agendaItemId,
      userId: participation.userId,
      interested: participation.interested,
      confirmed: participation.confirmed,
      createdAt: participation.createdAt,
      updatedAt: participation.updatedAt,
    };
  }
}
