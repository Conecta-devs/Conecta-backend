import { validate } from 'class-validator';
import {
  UpdateParticipationAttendanceDto,
  UpdateParticipationInterestDto,
} from './participation.dto.js';

describe('Participation DTOs', () => {
  it.each([true, false])('accepts boolean interest value %s', async (value) => {
    const dto = Object.assign(new UpdateParticipationInterestDto(), {
      interested: value,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([true, false])('accepts boolean attendance value %s', async (value) => {
    const dto = Object.assign(new UpdateParticipationAttendanceDto(), {
      confirmed: value,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['true', 1, null])('rejects non-boolean interest value %s', async (value) => {
    const dto = Object.assign(new UpdateParticipationInterestDto(), {
      interested: value,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it.each(['false', 0, null])('rejects non-boolean attendance value %s', async (value) => {
    const dto = Object.assign(new UpdateParticipationAttendanceDto(), {
      confirmed: value,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects identity and timestamp fields through the global pipe policy', async () => {
    const dto = Object.assign(new UpdateParticipationInterestDto(), {
      interested: true,
      userId: 'forged-user',
      agendaItemId: 'forged-item',
      _id: 'forged-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'userId',
        'agendaItemId',
        '_id',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('rejects requests without the required boolean field', async () => {
    const interest = new UpdateParticipationInterestDto();
    const attendance = new UpdateParticipationAttendanceDto();

    await expect(validate(interest)).resolves.not.toHaveLength(0);
    await expect(validate(attendance)).resolves.not.toHaveLength(0);
  });
});
