import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewTransferDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  approvedByName?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
