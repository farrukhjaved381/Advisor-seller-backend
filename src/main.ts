import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter, AllExceptionsFilter } from './filters/http-exception.filter';
import * as dotenv from 'dotenv';

dotenv.config();

let app: INestApplication;

async function createApp(): Promise<INestApplication> {
  const nestApp = await NestFactory.create(AppModule);

  nestApp.use(
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

  nestApp.use(cookieParser());

  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL, 'https://your-frontend-domain.vercel.app']
    : true;

  nestApp.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  nestApp.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  nestApp.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  nestApp.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Seller-Advisor Backend API')
    .setDescription('API for Seller-Advisor Matching Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(nestApp, config);
  SwaggerModule.setup('docs', nestApp, document);

  return nestApp;
}

async function bootstrap() {
  app = await createApp();
  await app.listen(process.env.PORT || 3000);
  console.log(`🚀 Backend server running on: http://localhost:${process.env.PORT || 3000}`);
  console.log(`📚 Swagger API docs available at: http://localhost:${process.env.PORT || 3000}/docs`);
}

export default async (req: any, res: any) => {
  if (!app) {
    app = await createApp();
    await app.init();
  }
  const adapter = app.getHttpAdapter().getInstance();
  adapter(req, res);
};

if (require.main === module) {
  bootstrap();
}
