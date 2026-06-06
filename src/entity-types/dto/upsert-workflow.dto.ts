import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkflowStateDto {
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsOptional()
  @IsBoolean()
  initial?: boolean;

  @IsOptional()
  @IsBoolean()
  terminal?: boolean;

  @IsOptional()
  @IsString()
  color?: string;
}

export class WorkflowTransitionDto {
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpsertWorkflowDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStateDto)
  states: WorkflowStateDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionDto)
  transitions: WorkflowTransitionDto[];
}
