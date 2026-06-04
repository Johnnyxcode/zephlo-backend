import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateConnectionDto {
  @IsUUID()
  fromDepartmentId: string;

  @IsUUID()
  toDepartmentId: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}
