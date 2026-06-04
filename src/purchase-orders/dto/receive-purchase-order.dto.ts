import { IsOptional, IsString } from 'class-validator';

export class ReceivePurchaseOrderDto {
  @IsOptional()
  @IsString()
  receivedByName?: string;
}
