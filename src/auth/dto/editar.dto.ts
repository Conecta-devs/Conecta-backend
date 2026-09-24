import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class EditarDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['masculino', 'feminino', 'outro', 'prefiro nao informar'])
  gen?: string;

  @IsOptional()
  @IsUrl({}, { message: 'image deve ser uma URL válida' })
  image?: string;

  @IsOptional()
  @IsString()
  @IsIn(['usuario', 'admin', 'moderador'])
  permissao?: string;
}
