import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { EntityTypesService } from './entity-types.service';
import { CreateEntityTypeDto } from './dto/create-entity-type.dto';
import { UpdateEntityTypeDto } from './dto/update-entity-type.dto';
import { CreateEntityFieldDto } from './dto/create-entity-field.dto';
import { UpsertWorkflowDto } from './dto/upsert-workflow.dto';

@Controller('entity-types')
export class EntityTypesController {
  constructor(private readonly entityTypesService: EntityTypesService) {}

  @Get()
  findAll() {
    return this.entityTypesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateEntityTypeDto) {
    return this.entityTypesService.create(dto);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.entityTypesService.findBySlug(slug);
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateEntityTypeDto) {
    return this.entityTypesService.update(slug, dto);
  }

  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.entityTypesService.delete(slug);
  }

  @Post(':slug/fields')
  addField(@Param('slug') slug: string, @Body() dto: CreateEntityFieldDto) {
    return this.entityTypesService.addField(slug, dto);
  }

  @Delete(':slug/fields/:fieldId')
  deleteField(@Param('slug') slug: string, @Param('fieldId') fieldId: string) {
    return this.entityTypesService.deleteField(slug, fieldId);
  }

  @Put(':slug/workflow')
  upsertWorkflow(@Param('slug') slug: string, @Body() dto: UpsertWorkflowDto) {
    return this.entityTypesService.upsertWorkflow(slug, dto);
  }
}
