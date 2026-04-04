import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Wire nestjs-pino as the NestJS logger (replaces default console logger)
  app.useLogger(app.get(Logger));

  // Enable cookie parser for HttpOnly refresh tokens
  app.use(cookieParser());

  // ✅ Golden Rule: Global validation pipe - liberal in accepting, conservative in sending
  // Note: GoldenRuleExceptionFilter and GoldenRuleInterceptor are registered in AppModule
  // via APP_FILTER / APP_INTERCEPTOR so they receive DI (PinoLogger injection).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      skipMissingProperties: false,
    })
  );

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
    .setDescription(
      'French-market SaaS for freelance invoicing - Following the Golden Rule: Liberal in accepting, Conservative in sending'
    )
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
      'jwt'
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

  const logger = app.get(Logger);
  logger.log(
    { event: 'server_start', port, env: process.env.NODE_ENV ?? 'development' },
    'FreelanceFlow API started'
  );
}

bootstrap();
