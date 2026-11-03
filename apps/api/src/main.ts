import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api (docs at /api/docs)`, 'Bootstrap');
}
bootstrap();
