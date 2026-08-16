import { Injectable } from '@nestjs/common';
import { Role } from './roles';

export type ReportAudit = {
  role: Role;
  reportId: string;
};

@Injectable()
export class ReportAuditService {
  private readonly audits: ReportAudit[] = [];

  record(role: Role, reportId: string): void {
    this.audits.push({ role, reportId });
  }

  all(): ReportAudit[] {
    return [...this.audits];
  }

  clear(): void {
    this.audits.length = 0;
  }
}
