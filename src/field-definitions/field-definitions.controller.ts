import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FieldDefinitionsService } from './field-definitions.service';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';

@Controller('departments/:departmentId/fields')
export class FieldDefinitionsController {
  constructor(private readonly fieldDefinitionsService: FieldDefinitionsService) {}

  @Get()
  findAll(@Param('departmentId') departmentId: string) {
    return this.fieldDefinitionsService.findByDepartment(departmentId);
  }

  @Post()
  create(
    @Param('departmentId') departmentId: string,
    @Body() dto: CreateFieldDefinitionDto,
  ) {
    return this.fieldDefinitionsService.create(departmentId, dto);
  }
}
