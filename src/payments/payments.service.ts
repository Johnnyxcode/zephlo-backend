import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InvoicesService } from '../invoices/invoices.service';

export class CreatePaymentDto {
  @IsString()
  invoiceId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  recordedByName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
      orderBy: { paidAt: 'desc' },
    });
  }

  findByInvoice(invoiceId: string) {
    const { tenantId } = getTenantContext();
    return this.prisma.payment.findMany({
      where: { invoiceId, tenantId },
      orderBy: { paidAt: 'desc' },
    });
  }

  async create(dto: CreatePaymentDto) {
    const { tenantId } = getTenantContext();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'CANCELLED' || invoice.status === 'WRITTEN_OFF') {
      throw new BadRequestException('Cannot record payment on a cancelled or written-off invoice');
    }

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        method: dto.method ?? 'CASH',
        reference: dto.reference,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        recordedByName: dto.recordedByName,
        notes: dto.notes,
      },
    });

    await this.invoicesService.updatePaidAmount(dto.invoiceId);
    return payment;
  }

  async remove(id: string) {
    const { tenantId } = getTenantContext();
    const payment = await this.prisma.payment.findFirst({ where: { id, tenantId } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { id } });
    await this.invoicesService.updatePaidAmount(payment.invoiceId);
    return { deleted: true };
  }
}
