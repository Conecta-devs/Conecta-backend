import { validate } from 'class-validator';
import { CreateAgendaItemDto } from './create-agenda-item.dto.js';
import { UpdateAgendaItemDto } from './update-agenda-item.dto.js';

const validItem = {
  title: 'Encontro',
  description: 'Descrição',
  kind: 'event',
  format: 'online',
  startsAt: '2030-04-01T10:00:00-03:00',
  endsAt: '2030-04-01T11:00:00-03:00',
  meetingUrl: 'https://meet.example.com/room',
};

describe('Agenda item DTOs', () => {
  it('accepts allowed kind, format and ISO dates with explicit timezone', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), validItem);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts ISO dates that omit seconds when the timezone is explicit', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), {
      ...validItem,
      startsAt: '2030-04-01T10:00-03:00',
      endsAt: '2030-04-01T11:00-03:00',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid kind and format values', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), {
      ...validItem,
      kind: 'webinar',
      format: 'hybrid',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['kind', 'format']),
    );
  });

  it('rejects invalid dates, missing timezone and an end not after the start', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), {
      ...validItem,
      startsAt: '2030-02-30T10:00:00Z',
      endsAt: '2030-04-01T09:00:00',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['startsAt', 'endsAt']),
    );
  });

  it('rejects an end date earlier than the start when both have timezones', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), {
      ...validItem,
      startsAt: '2030-04-01T11:00:00-03:00',
      endsAt: '2030-04-01T10:00:00-03:00',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('endsAt');
  });

  it('rejects client-controlled organizer and metadata fields', async () => {
    const dto = Object.assign(new CreateAgendaItemDto(), {
      ...validItem,
      organizerId: 'forged-user',
      _id: 'forged-id',
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'organizerId',
        '_id',
        'cancelledAt',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('allows omitted fields in a partial update', async () => {
    const dto = Object.assign(new UpdateAgendaItemDto(), { title: 'Atualizado' });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
