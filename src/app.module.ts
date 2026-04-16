import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ServicesModule } from './modules/services/services.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './common/health/health.module';
import { GoldenRuleExceptionFilter } from './common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from './common/interceptors/golden-rule.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { createPinoLoggerParams } from './common/logger/logger.config';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { RateLimitModule } from './common/throttler/rate-limit.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL')?.trim();
        const storage = redisUrl
          ? new RedisThrottlerStorage(new Redis(redisUrl, { maxRetriesPerRequest: null }))
          : undefined;
        return {
          storage,
          errorMessage: 'Trop de requêtes. Réessayez plus tard.',
          throttlers: [{ name: 'default', ttl: 60_000, limit: 999_999 }],
        };
      },
    }),
    RateLimitModule,
    LoggerModule.forRootAsync({
      useFactory: () => createPinoLoggerParams(),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ServicesModule,
    InvoicesModule,
    PdfModule,
    DashboardModule,
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
