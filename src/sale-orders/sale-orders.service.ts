import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';

export class OrderLineDto {
  @IsString()
  catalogItemId: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSaleOrderDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdByName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines: OrderLineDto[];
}

export class UpdateSaleOrderDto {
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines?: OrderLineDto[];
}

const ORDER_INCLUDE = {
  customer: true,
  lines: {
    include: {
      catalogItem: {
        include: {
          taxRate: true,
          item: { select: { id: true, name: true, departmentId: true } },
        },
      },
    },
  },
  invoices: { select: { id: true, invoiceNumber: true, status: true, total: true } },
} as const;

@Injectable()
export class SaleOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.saleOrder.findMany({
      where: { tenantId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const order = await this.prisma.saleOrder.findFirst({
      where: { id, tenantId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Sale order not found');
    return order;
  }

  async create(dto: CreateSaleOrderDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        reference: dto.reference,
        notes: dto.notes,
        createdByName: dto.createdByName,
        lines: {
          create: dto.lines.map((l) => ({
            catalogItemId: l.catalogItemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount ?? 0,
            description: l.description,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateSaleOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be edited');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.saleOrderLine.deleteMany({ where: { saleOrderId: id } });
        await tx.saleOrderLine.createMany({
          data: dto.lines.map((l) => ({
            saleOrderId: id,
            catalogItemId: l.catalogItemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount ?? 0,
            description: l.description,
          })),
        });
      }
      return tx.saleOrder.update({
        where: { id },
        data: { reference: dto.reference, notes: dto.notes },
        include: ORDER_INCLUDE,
      });
    });
  }

  async confirm(id: string) {
    const { tenantId } = getTenantContext();
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') throw new BadRequestException('Order is not in DRAFT status');

    await this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const ci = line.catalogItem as typeof line.catalogItem & { item: { id: string; departmentId: string } | null };
        if (ci.itemId && ci.item) {
          await this.inventory.applyMovementInTx(tx, {
            tenantId,
            departmentId: ci.item.departmentId,
            itemId: ci.itemId,
            quantityDelta: -line.quantity,
            referenceType: 'SALE',
            referenceId: order.id,
            createdByName: order.createdByName ?? 'System',
          });
        }
      }
      await tx.saleOrder.update({ where: { id }, data: { status: 'CONFIRMED' } });
    });

    return this.findOne(id);
  }

  async cancel(id: string) {
    const { tenantId } = getTenantContext();
    const order = await this.findOne(id);
    if (order.status === 'INVOICED') throw new BadRequestException('Invoiced orders cannot be cancelled');

    await this.prisma.$transaction(async (tx) => {
      if (order.status === 'CONFIRMED') {
        for (const line of order.lines) {
          const ci = line.catalogItem as typeof line.catalogItem & { item: { id: string; departmentId: string } | null };
          if (ci.itemId && ci.item) {
            await this.inventory.applyMovementInTx(tx, {
              tenantId,
              departmentId: ci.item.departmentId,
              itemId: ci.itemId,
              quantityDelta: line.quantity,
              referenceType: 'SALE_CANCELLED',
              referenceId: order.id,
              createdByName: 'System',
            });
          }
        }
      }
      await tx.saleOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    return this.findOne(id);
  }
}
