import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsArray()
  capabilities?: string[];

  @IsOptional()
  @IsString()
  color?: string;
}
