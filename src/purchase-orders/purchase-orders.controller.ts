import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { POStatus } from '@prisma/client';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReviewPurchaseOrderDto } from './dto/review-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  findAll(@Query('status') status?: POStatus) {
    return this.purchaseOrdersService.findAll(status);
  }

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewPurchaseOrderDto) {
    return this.purchaseOrdersService.review(id, dto);
  }

  @Patch(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.purchaseOrdersService.receive(id, dto);
  }
}
