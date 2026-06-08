import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SaleOrdersService, CreateSaleOrderDto, UpdateSaleOrderDto } from './sale-orders.service';

@Controller('sale-orders')
export class SaleOrdersController {
  constructor(private readonly saleOrdersService: SaleOrdersService) {}

  @Get()
  findAll() { return this.saleOrdersService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.saleOrdersService.findOne(id); }

  @Post()
  create(@Body() dto: CreateSaleOrderDto) { return this.saleOrdersService.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSaleOrderDto) {
    return this.saleOrdersService.update(id, dto);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) { return this.saleOrdersService.confirm(id); }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) { return this.saleOrdersService.cancel(id); }
}
