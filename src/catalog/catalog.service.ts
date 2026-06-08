import { Injectable, NotFoundException } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';

export class CreateCatalogItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  sellingPrice: number;

  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  taxRateId?: string;

  @IsOptional()
  @IsString()
  entityRecordId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;
}

export class UpdateCatalogItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  taxRateId?: string;

  @IsOptional()
  @IsString()
  entityRecordId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly INCLUDE = {
    taxRate: true,
    item: { select: { id: true, name: true, departmentId: true, department: { select: { id: true, name: true } } } },
  } as const;

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.catalogItem.findMany({
      where: { tenantId },
      include: CatalogService.INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, tenantId },
      include: CatalogService.INCLUDE,
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  create(dto: CreateCatalogItemDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.catalogItem.create({
      data: { tenantId, ...dto },
      include: CatalogService.INCLUDE,
    });
  }

  async update(id: string, dto: UpdateCatalogItemDto) {
    await this.findOne(id);
    return this.prisma.catalogItem.update({
      where: { id },
      data: dto,
      include: CatalogService.INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.catalogItem.delete({ where: { id } });
  }
}
