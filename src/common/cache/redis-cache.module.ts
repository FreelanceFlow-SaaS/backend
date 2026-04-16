import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { InvoiceReadCacheService } from './invoice-read-cache.service';

@Module({
  imports: [ConfigModule],
  providers: [CacheService, InvoiceReadCacheService],
  exports: [CacheService, InvoiceReadCacheService],
})
export class RedisCacheModule {}
