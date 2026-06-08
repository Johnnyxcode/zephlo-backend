import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InvoicesService, CreateInvoiceDto, UpdateInvoiceDto } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll() { return this.invoicesService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.invoicesService.findOne(id); }

  @Post()
  create(@Body() dto: CreateInvoiceDto) { return this.invoicesService.create(dto); }

  @Post('from-order/:orderId')
  createFromOrder(@Param('orderId') orderId: string, @Body() dto: Partial<CreateInvoiceDto>) {
    return this.invoicesService.createFromOrder(orderId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(id, dto);
  }

  @Post(':id/send')
  markSent(@Param('id') id: string) { return this.invoicesService.markSent(id); }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) { return this.invoicesService.cancel(id); }

  @Post(':id/write-off')
  writeOff(@Param('id') id: string) { return this.invoicesService.writeOff(id); }
}
