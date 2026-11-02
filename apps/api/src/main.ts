import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.includes('*') ? true : origins, credentials: true });

  const docs = new DocumentBuilder()
    .setTitle('MotorDesk API')
    .setDescription('Multi-tenant service station management platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api (docs at /api/docs)`, 'Bootstrap');
}
bootstrap();
