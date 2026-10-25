import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { ISO_8601_WITH_TIMEZONE } from './agenda-item.dto.js';
import {
  AGENDA_FORMATS,
  AGENDA_KINDS,
} from './create-agenda-item.dto.js';
import type {
  AgendaFormat,
  AgendaKind,
} from './create-agenda-item.dto.js';

export class UpdateAgendaItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(AGENDA_KINDS)
  kind?: AgendaKind;

  @IsOptional()
  @IsIn(AGENDA_FORMATS)
  format?: AgendaFormat;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(ISO_8601_WITH_TIMEZONE, {
    message: 'startsAt deve ser uma data ISO-8601 com fuso horário explícito.',
  })
  startsAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(ISO_8601_WITH_TIMEZONE, {
    message: 'endsAt deve ser uma data ISO-8601 com fuso horário explícito.',
  })
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  meetingUrl?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  location?: string | null;
}
