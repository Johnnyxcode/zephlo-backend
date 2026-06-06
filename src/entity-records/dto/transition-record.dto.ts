import { IsOptional, IsString, MinLength } from 'class-validator';

export class TransitionRecordDto {
  @IsString()
  @MinLength(1)
  transitionId: string;

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
