/**
 * Local development entry point: if MONGODB_URI is not set, starts an
 * in-memory MongoDB, seeds plans + demo data, then boots the API.
 */
import 'dotenv/config';

async function run() {
  if (!process.env.MONGODB_URI) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('motordesk');
    console.log(`In-memory MongoDB at ${process.env.MONGODB_URI}`);
  }
  process.env.JWT_SECRET ||= 'dev-secret-change-me';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { seed } = await import('./seed/seed');
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  await seed(ctx, { demo: true });
  await ctx.close();

  await import('./main');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
