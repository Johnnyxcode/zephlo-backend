import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ItemsService } from './items.service';
import { BulkImportItemsDto } from './dto/bulk-import-items.dto';
import { CreateItemDto } from './dto/create-item.dto';

@Controller('items')
export class AllItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findAll() {
    return this.itemsService.findAllForTenant();
  }
}

@Controller('departments/:departmentId/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findAll(@Param('departmentId') departmentId: string) {
    return this.itemsService.findByDepartment(departmentId);
  }

  @Post()
  create(
    @Param('departmentId') departmentId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.itemsService.create(departmentId, dto);
  }

  @Post('import')
  importItems(
    @Param('departmentId') departmentId: string,
    @Body() dto: BulkImportItemsDto,
  ) {
    return this.itemsService.bulkImport(departmentId, dto);
  }
}
