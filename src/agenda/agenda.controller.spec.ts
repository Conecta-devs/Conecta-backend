import { describe, expect, it, vi } from 'vitest';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto.js';
import {
  UpdateParticipationAttendanceDto,
  UpdateParticipationInterestDto,
} from './dto/participation.dto.js';

describe('AgendaController', () => {
  it('uses the authenticated request subject as organizer', async () => {
    const service = new AgendaService();
    const response = {
      id: 'created',
      title: 'Encontro',
      description: 'Descrição',
      kind: 'event',
      format: 'online',
      startsAt: new Date('2030-04-01T10:00:00Z'),
      endsAt: new Date('2030-04-01T11:00:00Z'),
      meetingUrl: null,
      location: null,
      organizerId: 'authenticated-user',
      cancelledAt: null,
      createdAt: new Date('2030-03-01T10:00:00Z'),
      updatedAt: new Date('2030-03-01T10:00:00Z'),
    };
    const createSpy = vi.spyOn(service, 'create').mockResolvedValue(response);
    const controller = new AgendaController(service);
    const dto = Object.assign(new CreateAgendaItemDto(), {
      title: 'Encontro',
      description: 'Descrição',
      kind: 'event',
      format: 'online',
      startsAt: '2030-04-01T10:00:00Z',
      endsAt: '2030-04-01T11:00:00Z',
    });

    await expect(
      controller.create(
        {
          user: {
            sub: 'authenticated-user',
            email: 'user@example.com',
            name: 'User',
          },
        } as Parameters<AgendaController['create']>[0],
        dto,
      ),
    ).resolves.toEqual(response);

    expect(createSpy).toHaveBeenCalledWith('authenticated-user', dto);
  });

  it('uses only req.user.sub and the route ID for participation operations', async () => {
    const service = new AgendaService();
    const getSpy = vi
      .spyOn(service, 'getMyParticipation')
      .mockResolvedValue({ interested: false, confirmed: false });
    const interestSpy = vi
      .spyOn(service, 'updateMyInterest')
      .mockResolvedValue({ interested: true, confirmed: false });
    const attendanceSpy = vi
      .spyOn(service, 'updateMyAttendance')
      .mockResolvedValue({ interested: false, confirmed: true });
    const controller = new AgendaController(service);
    const request = {
      user: {
        sub: 'authenticated-user',
        email: 'user@example.com',
        name: 'User',
      },
    } as Parameters<AgendaController['getMyParticipation']>[0];
    const interest = Object.assign(new UpdateParticipationInterestDto(), {
      interested: true,
    });
    const attendance = Object.assign(new UpdateParticipationAttendanceDto(), {
      confirmed: true,
    });

    await controller.getMyParticipation(request, '0123456789abcdef01234567');
    await controller.updateMyInterest(
      request,
      '0123456789abcdef01234567',
      interest,
    );
    await controller.updateMyAttendance(
      request,
      '0123456789abcdef01234567',
      attendance,
    );

    expect(getSpy).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      'authenticated-user',
    );
    expect(interestSpy).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      'authenticated-user',
      true,
    );
    expect(attendanceSpy).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      'authenticated-user',
      true,
    );
  });
});
