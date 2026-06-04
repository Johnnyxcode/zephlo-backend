import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class TransferLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateTransferDto {
  @IsUUID()
  fromDepartmentId: string;

  @IsUUID()
  toDepartmentId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];

  @IsOptional()
  @IsString()
  requestedByName?: string;
}
