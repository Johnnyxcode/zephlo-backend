import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  getOverview() {
    return this.reportsService.getOverview();
  }

  @Get('audit')
  getAuditLog() {
    return this.reportsService.getAuditLog();
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Res() res: Response) {
    const csv = await this.reportsService.exportCsv();
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zephlo-report-${Date.now()}.csv"`,
    );
    res.send(csv);
  }
}
