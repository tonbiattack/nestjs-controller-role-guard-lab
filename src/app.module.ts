import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller';
import { ReportAuditService } from './report-audit.service';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AdminReportsController],
  providers: [ReportAuditService, RolesGuard],
})
export class AppModule {}
