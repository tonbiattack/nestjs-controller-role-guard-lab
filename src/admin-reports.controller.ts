import {
  Controller,
  Get,
  Headers,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ReportAuditService } from './report-audit.service';
import { Role, Roles } from './roles';
import { RolesGuard } from './roles.guard';

@Controller('admin/reports')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
export class AdminReportsController {
  constructor(private readonly reportAuditService: ReportAuditService) {}

  @Get(':reportId')
  findOne(
    @Param('reportId') reportId: string,
    @Headers('x-role') role: Role = Role.Member,
  ): { id: string; total: number } {
    this.reportAuditService.record(role, reportId);

    return {
      id: reportId,
      total: 4200,
    };
  }
}
