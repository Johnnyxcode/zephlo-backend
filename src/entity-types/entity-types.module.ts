import { Module } from '@nestjs/common';
import { EntityTypesController } from './entity-types.controller';
import { EntityTypesService } from './entity-types.service';

@Module({
  controllers: [EntityTypesController],
  providers: [EntityTypesService],
  exports: [EntityTypesService],
})
export class EntityTypesModule {}
