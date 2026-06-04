import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class POLineDto {
  @IsString()
  @MinLength(1)
  itemName: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}
