import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

let cachedApp: any;

async function createApp() {
  if (!cachedApp) {
    cachedApp = await NestFactory.create(AppModule);

    // CORS: Allow all origins
    cachedApp.enableCors({
      origin: true,
      credentials: true,
    });

    // Input Validation
    cachedApp.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    // Swagger Setup
    const config = new DocumentBuilder()
      .setTitle('Seller-Advisor Backend API')
      .setDescription('API for Seller-Advisor Matching Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(cachedApp, config);
    SwaggerModule.setup('docs', cachedApp, document);

    await cachedApp.init();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  const httpAdapter = app.getHttpAdapter();
  return httpAdapter.getInstance()(req, res);
}