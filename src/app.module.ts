import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ServicesModule } from './modules/services/services.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { GoldenRuleExceptionFilter } from './common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from './common/interceptors/golden-rule.interceptor';
import { pinoLoggerConfig } from './common/logger/logger.config';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    LoggerModule.forRoot(pinoLoggerConfig),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ServicesModule,
    InvoicesModule,
    PdfModule,
  ],
  controllers: [HealthController],
  providers: [
    // Registered via DI so filters/interceptors can inject PinoLogger
    { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: GoldenRuleInterceptor },
  ],
})
export class AppModule {}
