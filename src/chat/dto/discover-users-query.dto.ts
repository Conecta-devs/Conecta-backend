import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DiscoverUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,3}$/)
  page?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,2}$/)
  limit?: string;
}
