import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReviewTransferDto } from './dto/review-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  findAll(status?: TransferStatus) {
    const { tenantId } = getTenantContext();
    return this.prisma.transferRequest.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        lines: { include: { item: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateTransferDto) {
    const { tenantId } = getTenantContext();

    const link = await this.prisma.departmentLink.findUnique({
      where: {
        fromDepartmentId_toDepartmentId: {
          fromDepartmentId: dto.fromDepartmentId,
          toDepartmentId: dto.toDepartmentId,
        },
      },
    });

    if (!link || link.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Transfers are not permitted between these departments',
      );
    }

    for (const line of dto.lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, departmentId: dto.fromDepartmentId },
      });
      if (!item) {
        throw new BadRequestException(
          `Item ${line.itemId} does not belong to the sending department`,
        );
      }
      const balance = await this.inventory.getBalance(
        line.itemId,
        dto.fromDepartmentId,
      );
      if (balance < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${item.name}`,
        );
      }
    }

    const status = link.requiresApproval
      ? TransferStatus.PENDING_APPROVAL
      : TransferStatus.APPROVED;

    const transfer = await this.prisma.transferRequest.create({
      data: {
        tenantId,
        fromDepartmentId: dto.fromDepartmentId,
        toDepartmentId: dto.toDepartmentId,
        status,
        requestedByName: dto.requestedByName ?? 'Staff',
        lines: {
          create: dto.lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
          })),
        },
      },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        lines: { include: { item: true } },
      },
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'transfer.created',
        actorName: dto.requestedByName ?? 'Staff',
        payload: { transferId: transfer.id, status },
      },
    });

    if (!link.requiresApproval) {
      return this.completeTransfer(transfer.id, 'System (auto-approved)');
    }

    return transfer;
  }

  async review(id: string, dto: ReviewTransferDto) {
    const { tenantId } = getTenantContext();
    const transfer = await this.prisma.transferRequest.findFirst({
      where: { id, tenantId },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Transfer is not awaiting approval');
    }

    if (dto.action === 'reject') {
      return this.prisma.transferRequest.update({
        where: { id },
        data: {
          status: TransferStatus.REJECTED,
          rejectionReason: dto.rejectionReason ?? 'Rejected',
          approvedByName: dto.approvedByName ?? 'Manager',
        },
        include: {
          fromDepartment: { select: { id: true, name: true } },
          toDepartment: { select: { id: true, name: true } },
          lines: { include: { item: true } },
        },
      });
    }

    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferStatus.APPROVED,
        approvedByName: dto.approvedByName ?? 'Manager',
      },
    });

    return this.completeTransfer(id, dto.approvedByName ?? 'Manager');
  }

  private async completeTransfer(id: string, actorName: string) {
    const { tenantId } = getTenantContext();

    const transfer = await this.prisma.transferRequest.findFirst({
      where: { id, tenantId },
      include: { lines: { include: { item: true } } },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    if (
      transfer.status !== TransferStatus.APPROVED &&
      transfer.status !== TransferStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException('Transfer cannot be completed');
    }

    for (const line of transfer.lines) {
      await this.inventory.recordMovement({
        tenantId,
        departmentId: transfer.fromDepartmentId,
        itemId: line.itemId,
        quantityDelta: -line.quantity,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        createdByName: actorName,
      });

      let receivingItem = await this.prisma.item.findFirst({
        where: {
          departmentId: transfer.toDepartmentId,
          name: line.item.name,
        },
      });

      if (!receivingItem) {
        receivingItem = await this.prisma.item.create({
          data: {
            departmentId: transfer.toDepartmentId,
            name: line.item.name,
            sku: line.item.sku,
            attributes: line.item.attributes ?? {},
          },
        });
      }

      await this.inventory.recordMovement({
        tenantId,
        departmentId: transfer.toDepartmentId,
        itemId: receivingItem.id,
        quantityDelta: line.quantity,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        createdByName: actorName,
      });
    }

    const completed = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferStatus.COMPLETED,
        completedAt: new Date(),
        approvedByName: actorName,
      },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        lines: { include: { item: true } },
      },
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'transfer.completed',
        actorName,
        payload: { transferId: id },
      },
    });

    return completed;
  }
}
