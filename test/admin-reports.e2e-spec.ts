import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReportAuditService } from '../src/report-audit.service';
import { Role } from '../src/roles';

describe('AdminReportsController', () => {
  let app: INestApplication;
  let reportAuditService: ReportAuditService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    reportAuditService = moduleRef.get(ReportAuditService);
  });

  beforeEach(() => {
    reportAuditService.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('memberはクラスレベルで管理者限定されたレポートを取得できない', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports/monthly-2026-08')
      .set('x-role', Role.Member)
      .expect(403);
  });

  it('拒否されたmemberの要求は監査対象のレポート到達を記録しない', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports/monthly-2026-08')
      .set('x-role', Role.Member);

    expect(reportAuditService.all()).toEqual([]);
  });

  it('adminはレポートを取得でき、到達を監査へ記録する', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/reports/monthly-2026-08')
      .set('x-role', Role.Admin)
      .expect(200);

    expect(response.body).toEqual({
      id: 'monthly-2026-08',
      total: 4200,
    });
    expect(reportAuditService.all()).toEqual([
      {
        role: Role.Admin,
        reportId: 'monthly-2026-08',
      },
    ]);
  });
});
