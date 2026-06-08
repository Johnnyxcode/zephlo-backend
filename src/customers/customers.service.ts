import { Injectable, NotFoundException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  attributes?: Record<string, unknown>;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  attributes?: Record<string, unknown>;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true, invoices: true } },
      },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  create(dto: CreateCustomerDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        attributes: dto.attributes as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        attributes: dto.attributes as Prisma.InputJsonValue,
      },
    });
  }

  async remove(id: string) {
    const { tenantId } = getTenantContext();
    await this.findOne(id);
    return this.prisma.customer.delete({ where: { id } });
  }
}
