import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { POStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReviewPurchaseOrderDto } from './dto/review-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  lines: true,
} as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  findAll(status?: POStatus) {
    const { tenantId } = getTenantContext();
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: PO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreatePurchaseOrderDto) {
    const { tenantId } = getTenantContext();

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, tenantId },
    });
    if (!department) throw new NotFoundException('Department not found');

    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId: dto.supplierId,
        departmentId: dto.departmentId,
        status: POStatus.PENDING_APPROVAL,
        requestedByName: dto.requestedByName ?? 'Staff',
        notes: dto.notes,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
        lines: {
          create: dto.lines.map((l) => ({
            itemName: l.itemName,
            sku: l.sku,
            quantity: l.quantity,
            unitCost: l.unitCost ?? 0,
          })),
        },
      },
      include: PO_INCLUDE,
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'purchase_order.created',
        actorName: dto.requestedByName ?? 'Staff',
        payload: { purchaseOrderId: po.id, supplierId: dto.supplierId },
      },
    });

    return po;
  }

  async review(id: string, dto: ReviewPurchaseOrderDto) {
    const { tenantId } = getTenantContext();
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });

    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== POStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Purchase order is not awaiting approval');
    }

    if (dto.action === 'reject') {
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: POStatus.CANCELLED,
          rejectionReason: dto.rejectionReason ?? 'Rejected',
          approvedByName: dto.approvedByName ?? 'Manager',
        },
        include: PO_INCLUDE,
      });
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: POStatus.APPROVED,
        approvedByName: dto.approvedByName ?? 'Manager',
      },
      include: PO_INCLUDE,
    });
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto) {
    const { tenantId } = getTenantContext();
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });

    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== POStatus.APPROVED) {
      throw new BadRequestException('Purchase order must be approved before receiving');
    }

    const actorName = dto.receivedByName ?? 'Staff';

    for (const line of po.lines) {
      let item = await this.prisma.item.findFirst({
        where: { departmentId: po.departmentId, name: line.itemName },
      });

      if (!item) {
        item = await this.prisma.item.create({
          data: {
            departmentId: po.departmentId,
            name: line.itemName,
            sku: line.sku ?? undefined,
            attributes: {},
          },
        });
      }

      await this.inventory.recordMovement({
        tenantId,
        departmentId: po.departmentId,
        itemId: item.id,
        quantityDelta: line.quantity,
        referenceType: 'PURCHASE_ORDER',
        referenceId: po.id,
        createdByName: actorName,
      });
    }

    const received = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: POStatus.RECEIVED,
        completedAt: new Date(),
        approvedByName: actorName,
      },
      include: PO_INCLUDE,
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'purchase_order.received',
        actorName,
        payload: { purchaseOrderId: id },
      },
    });

    return received;
  }
}
