import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaService } from './agenda.service.js';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto.js';
import { UpdateAgendaItemDto } from './dto/update-agenda-item.dto.js';

const mocks = vi.hoisted(() => {
  const query = {
    where: vi.fn(),
    orderBy: vi.fn(),
    all: vi.fn(),
    first: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const participationQuery = {
    where: vi.fn(),
    first: vi.fn(),
    upsert: vi.fn(),
  };
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  participationQuery.where.mockReturnValue(participationQuery);
  return { query, participationQuery };
});

vi.mock('../prisma/db.js', () => ({
  db: {
    orm: {
      agenda_items: mocks.query,
      agenda_participations: mocks.participationQuery,
    },
  },
}));

const startsAt = new Date('2030-04-01T13:00:00.000Z');
const endsAt = new Date('2030-04-01T14:00:00.000Z');

const item = {
  _id: '0123456789abcdef01234567',
  title: 'Encontro',
  description: 'Descrição',
  kind: 'event',
  format: 'online',
  startsAt,
  endsAt,
  meetingUrl: 'https://meet.example.com/room',
  location: null,
  organizerId: 'abcdefabcdefabcdefabcdef',
  cancelledAt: null,
  createdAt: new Date('2030-03-01T10:00:00.000Z'),
  updatedAt: new Date('2030-03-01T10:00:00.000Z'),
};
const participation = {
  _id: 'fedcba987654321001234567',
  agendaItemId: item._id,
  userId: 'fedcbafedcbafedcbafedcba',
  interested: true,
  confirmed: false,
  createdAt: new Date('2030-03-02T10:00:00.000Z'),
  updatedAt: new Date('2030-03-02T10:00:00.000Z'),
};

const createDto = Object.assign(new CreateAgendaItemDto(), {
  title: '  Encontro  ',
  description: '  Descrição  ',
  kind: 'event',
  format: 'online',
  startsAt: '2030-04-01T10:00:00-03:00',
  endsAt: '2030-04-01T11:00:00-03:00',
  meetingUrl: 'https://meet.example.com/room',
});

describe('AgendaService', () => {
  const service = new AgendaService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.where.mockReturnValue(mocks.query);
    mocks.query.orderBy.mockReturnValue(mocks.query);
    mocks.participationQuery.where.mockReturnValue(mocks.participationQuery);
  });

  it('lists active items ordered by start time', async () => {
    mocks.query.all.mockResolvedValue([item]);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ id: item._id, organizerId: item.organizerId }),
    ]);
    expect(mocks.query.orderBy).toHaveBeenCalledWith({ startsAt: 1 });
    expect(mocks.query.all).toHaveBeenCalledOnce();
  });

  it('creates an item with the authenticated organizer and explicit timestamps', async () => {
    mocks.query.create.mockImplementation(async (data) => ({
      ...item,
      ...data,
    }));

    const result = await service.create(item.organizerId, createDto);

    expect(mocks.query.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Encontro',
        description: 'Descrição',
        organizerId: item.organizerId,
        cancelledAt: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(result.organizerId).toBe(item.organizerId);
  });

  it('returns 400 for a malformed ObjectId before querying Mongo', async () => {
    await expect(service.findOne('not-an-object-id')).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(mocks.query.where).not.toHaveBeenCalled();
  });

  it('returns 404 when an item does not exist or is cancelled', async () => {
    mocks.query.first.mockResolvedValue(null);
    await expect(service.findOne(item._id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 403 when a different user attempts to edit the item', async () => {
    mocks.query.first.mockResolvedValue(item);

    await expect(
      service.update(
        item._id,
        'fedcbafedcbafedcbafedcba',
        Object.assign(new UpdateAgendaItemDto(), { title: 'Outro título' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.query.update).not.toHaveBeenCalled();
  });

  it('preserves omitted fields on partial updates and updates updatedAt', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.query.update.mockImplementation(async (data) => ({
      ...item,
      ...data,
    }));

    const result = await service.update(
      item._id,
      item.organizerId,
      Object.assign(new UpdateAgendaItemDto(), { title: 'Novo título' }),
    );

    const updateData = mocks.query.update.mock.calls[0][0];
    expect(updateData).toEqual({
      title: 'Novo título',
      updatedAt: expect.any(Date),
    });
    expect(updateData).not.toHaveProperty('description');
    expect(mocks.query.where).toHaveBeenCalledWith({
      _id: item._id,
      organizerId: item.organizerId,
      updatedAt: item.updatedAt,
    });
    expect(result.description).toBe(item.description);
  });

  it('rejects edits after cancellation', async () => {
    mocks.query.first.mockResolvedValue({
      ...item,
      cancelledAt: new Date(),
    });

    await expect(
      service.update(
        item._id,
        item.organizerId,
        Object.assign(new UpdateAgendaItemDto(), { title: 'Novo título' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects modality changes that leave incompatible meeting details', async () => {
    mocks.query.first.mockResolvedValue(item);

    await expect(
      service.update(
        item._id,
        item.organizerId,
        Object.assign(new UpdateAgendaItemDto(), { format: 'in_person' }),
      ),
    ).rejects.toThrow('Informe a localização do encontro presencial.');
    expect(mocks.query.update).not.toHaveBeenCalled();
  });

  it('cancels an item owned by the user and sets cancellation timestamps', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.query.update.mockImplementation(async (data) => ({
      ...item,
      ...data,
    }));

    const result = await service.cancel(item._id, item.organizerId);

    expect(mocks.query.update).toHaveBeenCalledWith({
      cancelledAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it('rejects cancellation by another user and repeated cancellation', async () => {
    mocks.query.first.mockResolvedValue(item);
    await expect(
      service.cancel(item._id, 'fedcbafedcbafedcbafedcba'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    mocks.query.first.mockResolvedValue({ ...item, cancelledAt: new Date() });
    await expect(
      service.cancel(item._id, item.organizerId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.query.update).not.toHaveBeenCalled();
  });

  it('returns false participation states without creating a record on GET', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.participationQuery.first.mockResolvedValue(null);

    await expect(
      service.getMyParticipation(item._id, participation.userId),
    ).resolves.toEqual({
      id: null,
      agendaItemId: item._id,
      userId: participation.userId,
      interested: false,
      confirmed: false,
      createdAt: null,
      updatedAt: null,
    });
    expect(mocks.participationQuery.where).toHaveBeenCalledWith({
      agendaItemId: item._id,
      userId: participation.userId,
    });
    expect(mocks.participationQuery.upsert).not.toHaveBeenCalled();
  });

  it('returns the authenticated user’s existing participation', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.participationQuery.first.mockResolvedValue(participation);

    await expect(
      service.getMyParticipation(item._id, participation.userId),
    ).resolves.toEqual({
      id: participation._id,
      agendaItemId: item._id,
      userId: participation.userId,
      interested: true,
      confirmed: false,
      createdAt: participation.createdAt,
      updatedAt: participation.updatedAt,
    });
  });

  it('updates interest without changing confirmation and initializes both states on insert', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.participationQuery.upsert.mockResolvedValue({
      ...participation,
      interested: false,
      confirmed: true,
    });

    const result = await service.updateMyInterest(
      item._id,
      participation.userId,
      false,
    );

    expect(mocks.participationQuery.where).toHaveBeenCalledWith({
      agendaItemId: item._id,
      userId: participation.userId,
    });
    expect(mocks.participationQuery.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        agendaItemId: item._id,
        userId: participation.userId,
        interested: false,
        confirmed: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
      update: {
        interested: false,
        updatedAt: expect.any(Date),
      },
    });
    const upsert = mocks.participationQuery.upsert.mock.calls[0][0];
    expect(upsert.update).not.toHaveProperty('confirmed');
    expect(result.confirmed).toBe(true);
  });

  it('updates attendance without changing interest', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.participationQuery.upsert.mockResolvedValue({
      ...participation,
      interested: true,
      confirmed: true,
    });

    const result = await service.updateMyAttendance(
      item._id,
      participation.userId,
      true,
    );

    const upsert = mocks.participationQuery.upsert.mock.calls[0][0];
    expect(upsert.create).toEqual(
      expect.objectContaining({ interested: false, confirmed: true }),
    );
    expect(upsert.update).toEqual({
      confirmed: true,
      updatedAt: expect.any(Date),
    });
    expect(upsert.update).not.toHaveProperty('interested');
    expect(result.interested).toBe(true);
  });

  it('uses the same compound-key upsert for repeated set operations', async () => {
    mocks.query.first.mockResolvedValue(item);
    mocks.participationQuery.upsert.mockResolvedValue({
      ...participation,
      interested: true,
    });

    await service.updateMyInterest(item._id, participation.userId, true);
    await service.updateMyInterest(item._id, participation.userId, true);

    expect(mocks.participationQuery.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.participationQuery.where).toHaveBeenNthCalledWith(1, {
      agendaItemId: item._id,
      userId: participation.userId,
    });
    expect(mocks.participationQuery.where).toHaveBeenNthCalledWith(2, {
      agendaItemId: item._id,
      userId: participation.userId,
    });
  });

  it('rejects participation reads and writes for missing or cancelled agenda items', async () => {
    mocks.query.first.mockResolvedValue(null);

    await expect(
      service.getMyParticipation(item._id, participation.userId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateMyInterest(item._id, participation.userId, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateMyAttendance(item._id, participation.userId, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mocks.participationQuery.first).not.toHaveBeenCalled();
    expect(mocks.participationQuery.upsert).not.toHaveBeenCalled();
  });
});
