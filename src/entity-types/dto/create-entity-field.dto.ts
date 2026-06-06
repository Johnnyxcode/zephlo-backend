import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { FieldType } from '@prisma/client';

export class CreateEntityFieldDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsIn(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT'])
  fieldType: FieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
