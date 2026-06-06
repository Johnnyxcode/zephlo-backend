import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { EntityRecordsService } from './entity-records.service';
import { CreateEntityRecordDto } from './dto/create-entity-record.dto';
import { TransitionRecordDto } from './dto/transition-record.dto';

@Controller('entity-types/:slug/records')
export class EntityRecordsController {
  constructor(private readonly entityRecordsService: EntityRecordsService) {}

  @Get()
  findAll(@Param('slug') slug: string) {
    return this.entityRecordsService.findAll(slug);
  }

  @Post()
  create(@Param('slug') slug: string, @Body() dto: CreateEntityRecordDto) {
    return this.entityRecordsService.create(slug, dto);
  }

  @Get(':id/linked')
  findLinked(@Param('slug') slug: string, @Param('id') id: string) {
    return this.entityRecordsService.findLinked(slug, id);
  }

  @Get(':id')
  findOne(@Param('slug') slug: string, @Param('id') id: string) {
    return this.entityRecordsService.findOne(slug, id);
  }

  @Patch(':id')
  update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: CreateEntityRecordDto,
  ) {
    return this.entityRecordsService.update(slug, id, dto);
  }

  @Delete(':id')
  delete(@Param('slug') slug: string, @Param('id') id: string) {
    return this.entityRecordsService.delete(slug, id);
  }

  @Post(':id/transition')
  transition(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: TransitionRecordDto,
  ) {
    return this.entityRecordsService.transition(slug, id, dto);
  }
}
