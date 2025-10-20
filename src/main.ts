import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import {
  HttpExceptionFilter,
  AllExceptionsFilter,
} from './filters/http-exception.filter';
import * as dotenv from 'dotenv';

dotenv.config();

let app: INestApplication;

async function createApp(): Promise<INestApplication> {
  const nestApp = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body parsing for webhook verification
  });

  const httpAdapter = nestApp.getHttpAdapter();
  const instance: any =
    typeof (httpAdapter as any).getInstance === 'function'
      ? (httpAdapter as any).getInstance()
      : null;
  instance?.set?.('trust proxy', 1);

  // Security headers
  nestApp.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`, `https://unpkg.com`],
          objectSrc: [`'none'`],
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  nestApp.use('/api/', limiter);

  // Slow down repeated requests
  const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: 500, // begin adding 500ms of delay per request above 50
  });
  nestApp.use('/api/auth/', speedLimiter);

  nestApp.use(cookieParser());

  const appUrl = process.env.API_PUBLIC_URL
    ? process.env.API_PUBLIC_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined;

  const rawWhitelist = [
    process.env.FRONTEND_URL,
    appUrl,
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3003',
    'http://localhost:5174',
    'https://cimamplify-ui.vercel.app',
    'http://localhost:3003',
  ];

  const normalizeOrigin = (value?: string | null) => {
    if (!value) {
      return undefined;
    }
    try {
      return new URL(value).origin.replace(/\/$/, '');
    } catch {
      return value.replace(/\/$/, '');
    }
  };

  const allowedOrigins = new Set(
    rawWhitelist
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );

  const isAllowedPreviewOrigin = (value: string) => {
    try {
      const hostname = new URL(value).hostname;
      return /^(?:[a-z0-9-]+\.)?vercel\.app$/.test(hostname);
    } catch {
      return /^https:\/\/[a-z0-9-]+-vercel\.app$/.test(value);
    }
  };

  nestApp.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = normalizeOrigin(origin);
      if (
        normalizedOrigin &&
        (allowedOrigins.has(normalizedOrigin) ||
          isAllowedPreviewOrigin(normalizedOrigin))
      ) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Be explicit to satisfy strict preflight checks in some environments
    allowedHeaders: [
      'Content-Type',
      'content-type',
      'Authorization',
      'authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'x-csrf-token',
      'X-CSRF-Token',
      'Cookie',
    ],
    exposedHeaders: ['set-cookie'],
    optionsSuccessStatus: 204,
  });

  nestApp.useGlobalFilters(
    new AllExceptionsFilter(),
    new HttpExceptionFilter(),
  );

  nestApp.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
  await app.listen(process.env.PORT || 3003);
  console.log(
    `🚀 Backend server running on: http://localhost:${process.env.PORT || 3003}`,
  );
  console.log(
    `📚 Swagger API docs available at: http://localhost:${process.env.PORT || 3003}/docs`,
  );
}

export default async (req: any, res: any) => {
  // Handle CORS preflight requests immediately
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5174');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-csrf-token, X-CSRF-Token, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }

  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5174');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'set-cookie');

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
