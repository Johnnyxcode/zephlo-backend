import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';

export class InvoiceLineDto {
  @IsOptional()
  @IsString()
  catalogItemId?: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;
}

export const PAYMENT_TERMS = ['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_60'] as const;
export type PaymentTerm = typeof PAYMENT_TERMS[number];

function dueDateFromTerms(terms: PaymentTerm): Date {
  const days: Record<PaymentTerm, number> = {
    DUE_ON_RECEIPT: 0,
    NET_15: 15,
    NET_30: 30,
    NET_60: 60,
  };
  const d = new Date();
  d.setDate(d.getDate() + days[terms]);
  return d;
}

export class CreateInvoiceDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  saleOrderId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  createdByName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  discount?: number;
}

const INVOICE_INCLUDE = {
  customer: true,
  lines: { include: { catalogItem: true } },
  payments: true,
  saleOrder: { select: { id: true, reference: true } },
} as const;

function calcTotals(lines: InvoiceLineDto[], invoiceDiscount = 0) {
  let subtotal = 0;
  let taxAmount = 0;
  const computed = lines.map((l) => {
    const lineBase = l.quantity * l.unitPrice * (1 - (l.discount ?? 0) / 100);
    const lineTax = lineBase * ((l.taxRate ?? 0) / 100);
    subtotal += lineBase;
    taxAmount += lineTax;
    return { ...l, lineTotal: lineBase + lineTax };
  });
  const discountAmount = subtotal * (invoiceDiscount / 100);
  const total = subtotal - discountAmount + taxAmount;
  return { computed, subtotal, taxAmount, total };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { tenantId } });
    return `INV-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll() {
    const { tenantId } = getTenantContext();
    const now = new Date();
    await this.prisma.invoice.updateMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: now },
      },
      data: { status: 'OVERDUE' },
    });
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(dto: CreateInvoiceDto) {
    const { tenantId } = getTenantContext();
    const invoiceNumber = await this.nextInvoiceNumber(tenantId);
    const { computed, subtotal, taxAmount, total } = calcTotals(dto.lines, dto.discount);

    let dueDate: Date | undefined;
    if (dto.dueDate) {
      dueDate = new Date(dto.dueDate);
    } else if (dto.paymentTerms && PAYMENT_TERMS.includes(dto.paymentTerms as PaymentTerm)) {
      dueDate = dueDateFromTerms(dto.paymentTerms as PaymentTerm);
    }

    return this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        customerId: dto.customerId,
        saleOrderId: dto.saleOrderId,
        dueDate,
        paymentTerms: dto.paymentTerms,
        notes: dto.notes,
        discount: dto.discount ?? 0,
        subtotal,
        taxAmount,
        total,
        createdByName: dto.createdByName,
        lines: {
          create: computed.map((l) => ({
            catalogItemId: l.catalogItemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate ?? 0,
            discount: l.discount ?? 0,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
  }

  async createFromOrder(orderId: string, dto: Partial<CreateInvoiceDto> & { createdByName?: string; paymentTerms?: string }) {
    const { tenantId } = getTenantContext();
    const order = await this.prisma.saleOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { lines: { include: { catalogItem: { include: { taxRate: true } } } } },
    });
    if (!order) throw new NotFoundException('Sale order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('Cannot invoice a cancelled order');

    const lines: InvoiceLineDto[] = order.lines.map((l) => ({
      catalogItemId: l.catalogItemId,
      description: l.description ?? l.catalogItem.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.catalogItem.taxRate?.rate ?? 0,
      discount: l.discount,
    }));

    const invoice = await this.create({
      customerId: order.customerId,
      saleOrderId: orderId,
      notes: dto.notes,
      discount: dto.discount,
      paymentTerms: dto.paymentTerms,
      createdByName: dto.createdByName,
      lines,
    });

    await this.prisma.saleOrder.update({
      where: { id: orderId },
      data: { status: 'INVOICED' },
    });

    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id);
    if (!['DRAFT', 'SENT'].includes(invoice.status)) {
      throw new BadRequestException('Only DRAFT or SENT invoices can be edited');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        discount: dto.discount,
      },
      include: INVOICE_INCLUDE,
    });
  }

  async markSent(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Invoice is not in DRAFT status');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
      include: INVOICE_INCLUDE,
    });
  }

  async cancel(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID') throw new BadRequestException('Paid invoices cannot be cancelled');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INVOICE_INCLUDE,
    });
  }

  async writeOff(id: string) {
    await this.findOne(id);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'WRITTEN_OFF' },
      include: INVOICE_INCLUDE,
    });
  }

  async updatePaidAmount(id: string) {
    const payments = await this.prisma.payment.findMany({ where: { invoiceId: id } });
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return;
    const status =
      paidAmount >= invoice.total
        ? 'PAID'
        : paidAmount > 0
        ? 'PARTIALLY_PAID'
        : invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID'
        ? 'SENT'
        : invoice.status;
    return this.prisma.invoice.update({
      where: { id },
      data: { paidAmount, status },
      include: INVOICE_INCLUDE,
    });
  }
}
