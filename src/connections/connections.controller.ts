import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  findAll() {
    return this.connectionsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateConnectionDto) {
    return this.connectionsService.create(dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.connectionsService.delete(id);
  }
}
