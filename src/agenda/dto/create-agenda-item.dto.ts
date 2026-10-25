import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ISO_8601_WITH_TIMEZONE, IsAfterStartsAt } from './agenda-item.dto.js';

export const AGENDA_KINDS = ['event', 'conversation'] as const;
export const AGENDA_FORMATS = ['online', 'in_person'] as const;

export type AgendaKind = (typeof AGENDA_KINDS)[number];
export type AgendaFormat = (typeof AGENDA_FORMATS)[number];

export class CreateAgendaItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsIn(AGENDA_KINDS)
  kind!: AgendaKind;

  @IsIn(AGENDA_FORMATS)
  format!: AgendaFormat;

  @IsDateString({ strict: true })
  @Matches(ISO_8601_WITH_TIMEZONE, {
    message: 'startsAt deve ser uma data ISO-8601 com fuso horário explícito.',
  })
  startsAt!: string;

  @IsDateString({ strict: true })
  @Matches(ISO_8601_WITH_TIMEZONE, {
    message: 'endsAt deve ser uma data ISO-8601 com fuso horário explícito.',
  })
  @IsAfterStartsAt()
  endsAt!: string;

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
