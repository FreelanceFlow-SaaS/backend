import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { HealthModule } from './common/health/health.module';
import { GoldenRuleExceptionFilter } from './common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from './common/interceptors/golden-rule.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { pinoLoggerConfig } from './common/logger/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    LoggerModule.forRoot(pinoLoggerConfig),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ServicesModule,
    InvoicesModule,
    PdfModule,
  ],
  providers: [
    // Registered via DI so filters/interceptors can inject PinoLogger
    { provide: APP_FILTER, useClass: GoldenRuleExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: GoldenRuleInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Echoes pino-http's req.id back as X-Request-Id response header.
    // Runs after LoggerModule middleware so req.id is already set.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
