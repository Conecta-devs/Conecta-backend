import { IsBoolean } from 'class-validator';

export class UpdateParticipationInterestDto {
  @IsBoolean()
  interested!: boolean;
}

export class UpdateParticipationAttendanceDto {
  @IsBoolean()
  confirmed!: boolean;
}
