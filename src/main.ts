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
    rawBody: true,
  });

  const httpAdapter = nestApp.getHttpAdapter();
  const instance: any =
    typeof (httpAdapter as any).getInstance === 'function'
      ? (httpAdapter as any).getInstance()
      : null;

  // Trust Nginx proxy
  instance?.set?.('trust proxy', 1);

  // Security headers with proper CSP for Swagger
  nestApp.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
          objectSrc: ["'none'"],
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
  nestApp.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/api/payment/webhook',
    }),
  );

  // Slow down repeated requests
  nestApp.use(
    '/api/auth/',
    slowDown({
      windowMs: 15 * 60 * 1000,
      delayAfter: 200,
      delayMs: 300,
    }),
  );

  nestApp.use(cookieParser());

  // CORS
  const rawWhitelist = [
    process.env.FRONTEND_URL,
    process.env.API_PUBLIC_URL,
    'https://app.advisorchooser.com',
    'https://cimamplify-ui.vercel.app',
  ];

  const normalizeOrigin = (value?: string | null) => {
    if (!value) return undefined;
    try {
      return new URL(value).origin.replace(/\/$/, '');
    } catch {
      return value.replace(/\/$/, '');
    }
  };

  const allowedOrigins = new Set(
    rawWhitelist.map(normalizeOrigin).filter((o): o is string => !!o),
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
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (normalized && (allowedOrigins.has(normalized) || isAllowedPreviewOrigin(normalized))) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
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

  // Global filters and pipes
  nestApp.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  nestApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  nestApp.setGlobalPrefix('api');

  // Swagger config with HTTPS server
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seller-Advisor Backend API')
    .setDescription('API for Seller-Advisor Matching Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('https://api.advisorchooser.com') // Force HTTPS
    .build();

  const document = SwaggerModule.createDocument(nestApp, swaggerConfig);
  SwaggerModule.setup('docs', nestApp, document, {
    swaggerOptions: {
      url: 'https://api.advisorchooser.com/api-json', // force HTTPS for JSON
    },
  });

  return nestApp;
}

async function bootstrap() {
  app = await createApp();
  await app.listen(process.env.PORT || 3003);
  console.log(`🚀 Backend running on: http://localhost:${process.env.PORT || 3003}`);
  console.log(`📚 Swagger docs: https://api.advisorchooser.com/docs`);
}

// Export for serverless / Lambda style usage
export default async (req: any, res: any) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://app.advisorchooser.com');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-csrf-token, X-CSRF-Token, Cookie',
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', 'https://app.advisorchooser.com');
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
