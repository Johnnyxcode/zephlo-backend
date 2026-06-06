import { IsObject, IsOptional } from 'class-validator';

export class CreateEntityRecordDto {
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
