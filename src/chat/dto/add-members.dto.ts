import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsMongoId,
} from 'class-validator';

export class AddMembersDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  memberIds!: string[];
}
