import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TaxRatesService, CreateTaxRateDto, UpdateTaxRateDto } from './tax-rates.service';

@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly taxRatesService: TaxRatesService) {}

  @Get()
  findAll() { return this.taxRatesService.findAll(); }

  @Post()
  create(@Body() dto: CreateTaxRateDto) { return this.taxRatesService.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaxRateDto) {
    return this.taxRatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.taxRatesService.remove(id); }
}
