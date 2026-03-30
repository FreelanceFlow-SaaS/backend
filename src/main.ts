import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GoldenRuleExceptionFilter } from './common/filters/golden-rule-exception.filter';
import { GoldenRuleInterceptor } from './common/interceptors/golden-rule.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Golden Rule: Global validation pipe - liberal in accepting, conservative in sending
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // ✅ Strip unknown properties (be liberal in accepting)
      forbidNonWhitelisted: false, // ✅ Don't throw errors for extra fields
      transform: true,          // ✅ Transform and sanitize input
      skipMissingProperties: false, // ✅ Validate required fields strictly
    }),
  );

  // ✅ Golden Rule: Global exception filter with French error messages
  app.useGlobalFilters(new GoldenRuleExceptionFilter());

  // ✅ Golden Rule: Global interceptor for response sanitization  
  app.useGlobalInterceptors(new GoldenRuleInterceptor());

  // CORS configuration for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('FreelanceFlow API')
    .setDescription('French-market SaaS for freelance invoicing - Following the Golden Rule: Liberal in accepting, Conservative in sending')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'jwt',
    )
    .addCookieAuth('refreshToken', {
      type: 'http',
      in: 'cookie',
      scheme: 'bearer',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 FreelanceFlow API running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`✨ Golden Rule: Liberal in accepting, Conservative in sending`);
}

bootstrap();