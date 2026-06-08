import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';

export class CreateTaxRateDto {
  @IsString()
  name: string;

  @IsNumber()
  rate: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.taxRate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTaxRateDto) {
    const { tenantId } = getTenantContext();
    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRate.create({ data: { tenantId, ...dto } });
  }

  async update(id: string, dto: UpdateTaxRateDto) {
    const { tenantId } = getTenantContext();
    const existing = await this.prisma.taxRate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Tax rate not found');
    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const { tenantId } = getTenantContext();
    const existing = await this.prisma.taxRate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Tax rate not found');
    return this.prisma.taxRate.delete({ where: { id } });
  }
}
