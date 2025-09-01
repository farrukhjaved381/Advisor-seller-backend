import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'; // For Swagger
import { ValidationPipe } from '@nestjs/common'; // For input validation
import helmet from 'helmet'; // Security headers
import { ThrottlerGuard } from '@nestjs/throttler'; // Rate limiting
import * as dotenv from 'dotenv'; // Env config

async function bootstrap() {
  dotenv.config(); // Load .env file

  const app = await NestFactory.create(AppModule);

  // Security: Helmet for HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`, `https://unpkg.com`],
        },
      },
    }),
  );

  // CORS: Allow all origins for dev (restrict in prod)
  app.enableCors();

  // Rate Limiting: Applied via module configuration

  // Input Validation: Global pipe with class-validator
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strip non-whitelisted properties
    forbidNonWhitelisted: true, // Throw error on non-whitelisted
    transform: true, // Auto-transform payloads to DTO types
  }));

  // Swagger Setup: API Documentation at /docs
  const config = new DocumentBuilder()
    .setTitle('Seller-Advisor Backend API')
    .setDescription('API for Seller-Advisor Matching Platform')
    .setVersion('1.0')
    .addBearerAuth() // For JWT auth later
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Backend server running on: http://localhost:${port}`);
  console.log(`📚 Swagger API docs available at: http://localhost:${port}/docs`);
}
bootstrap();