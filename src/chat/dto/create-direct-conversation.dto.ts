import { IsMongoId } from 'class-validator';

export class CreateDirectConversationDto {
  @IsMongoId()
  participantId!: string;
}
