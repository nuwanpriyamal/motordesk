import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express = require('express');
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | undefined;

/** Builds the Nest app once per warm function instance and reuses it across requests. */
function getHandler(): Promise<Handler> {
  ready ??= (async () => {
    const server = express();
    const app = configureApp(await NestFactory.create(AppModule, new ExpressAdapter(server), { logger: ['error', 'warn', 'log'] }));
    await app.init();
    return server as unknown as Handler;
  })().catch((e) => {
    ready = undefined; // let the next request retry a failed cold start
    throw e;
  });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getHandler();
  app(req, res);
}
