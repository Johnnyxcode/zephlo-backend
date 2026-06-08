import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CatalogService, CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  findAll() { return this.catalogService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.catalogService.findOne(id); }

  @Post()
  create(@Body() dto: CreateCatalogItemDto) { return this.catalogService.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto) {
    return this.catalogService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.catalogService.remove(id); }
}
