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

    // API Documentation endpoint
    const config = new DocumentBuilder()
      .setTitle('Seller-Advisor Backend API')
      .setDescription('API for Seller-Advisor Matching Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(cachedApp, config);
    
    // Serve JSON docs at /api-docs
    cachedApp.use('/api-docs', (req, res) => {
      res.json(document);
    });
    
    // Simple HTML docs page
    cachedApp.use('/docs', (req, res) => {
      res.send(`
        <html>
          <head><title>Seller-Advisor API</title></head>
          <body>
            <h1>Seller-Advisor Backend API</h1>
            <p>API is running successfully!</p>
            <p><a href="/api-docs">View API JSON Schema</a></p>
            <h2>Available Endpoints:</h2>
            <ul>
              <li>GET / - Health check</li>
              <li>GET /api-docs - API documentation (JSON)</li>
            </ul>
          </body>
        </html>
      `);
    });

    await cachedApp.init();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  return app.getHttpAdapter().getInstance()(req, res);
}