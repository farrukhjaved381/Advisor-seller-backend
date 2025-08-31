import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

let cachedApp: any;

async function createApp() {
  if (!cachedApp) {
    cachedApp = await NestFactory.create(AppModule);

    // Security: Helmet for HTTP headers
    cachedApp.use(helmet());

    // CORS: Allow all origins
    cachedApp.enableCors();

    // Input Validation: Global pipe with class-validator
    cachedApp.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    // Swagger Setup: API Documentation at /docs
    const config = new DocumentBuilder()
      .setTitle('Seller-Advisor Backend API')
      .setDescription('API for Seller-Advisor Matching Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(cachedApp, config);
    SwaggerModule.setup('docs', cachedApp, document, {
      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js'
      ]
    });

    await cachedApp.init();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  return app.getHttpAdapter().getInstance()(req, res);
}