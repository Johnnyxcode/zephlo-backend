import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TransferStatus } from '@prisma/client';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReviewTransferDto } from './dto/review-transfer.dto';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  findAll(@Query('status') status?: TransferStatus) {
    return this.transfersService.findAll(status);
  }

  @Post()
  create(@Body() dto: CreateTransferDto) {
    return this.transfersService.create(dto);
  }

  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewTransferDto) {
    return this.transfersService.review(id, dto);
  }
}
