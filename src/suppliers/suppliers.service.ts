import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.supplier.findMany({
      where: { tenantId },
      include: { _count: { select: { purchaseOrders: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { purchaseOrders: true } } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    const { tenantId } = getTenantContext();
    const existing = await this.prisma.supplier.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Supplier "${dto.name}" already exists`);
    }
    return this.prisma.supplier.create({
      data: { tenantId, ...dto },
      include: { _count: { select: { purchaseOrders: true } } },
    });
  }
}
