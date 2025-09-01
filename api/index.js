const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module');
const { ValidationPipe } = require('@nestjs/common');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

let app;

module.exports = async (req, res) => {
  if (!app) {
    try {
      app = await NestFactory.create(AppModule);
      
      // Enable CORS
      app.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
      
      // Input Validation
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }));
      
      // Swagger Setup with custom options for Vercel
      const config = new DocumentBuilder()
        .setTitle('Seller-Advisor Backend API')
        .setDescription('API for Seller-Advisor Matching Platform')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      
      const document = SwaggerModule.createDocument(app, config);
      
      // Setup Swagger with custom options for serverless
      SwaggerModule.setup('docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
        customSiteTitle: 'Seller-Advisor API',
        customfavIcon: '/favicon.ico',
        customJs: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
        ],
        customCssUrl: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
        ],
      });
      
      await app.init();
      console.log('NestJS app initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NestJS app:', error);
      return res.status(500).json({ error: 'Failed to initialize application', details: error.message });
    }
  }
  
  try {
    const handler = app.getHttpAdapter().getInstance();
    return handler(req, res);
  } catch (error) {
    console.error('Request handling error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};