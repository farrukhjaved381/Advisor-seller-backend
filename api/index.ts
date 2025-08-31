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
    
    // Swagger UI HTML page
    cachedApp.use('/docs', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Seller-Advisor API Documentation</title>
            <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
            <style>
              html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
              *, *:before, *:after { box-sizing: inherit; }
              body { margin:0; background: #fafafa; }
            </style>
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
            <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
            <script>
              window.onload = function() {
                const ui = SwaggerUIBundle({
                  url: '/api-docs',
                  dom_id: '#swagger-ui',
                  deepLinking: true,
                  presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                  ],
                  plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                  ],
                  layout: "StandaloneLayout"
                });
              };
            </script>
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