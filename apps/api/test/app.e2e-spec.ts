import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as request from 'supertest';

describe('MotorDesk API (e2e)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let owner: string;
  let admin: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('e2e');
    // Pin everything the test relies on so a developer's local .env cannot leak in.
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.APP_ENV = 'development';
    process.env.SUPER_ADMIN_EMAIL = 'admin@motordesk.local';
    process.env.SUPER_ADMIN_PASSWORD = 'ChangeMe123!';
    delete process.env.REDIS_URL;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const { AppModule } = await import('../src/app.module');
    const { seed } = await import('../src/seed/seed');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await seed(app, { demo: true });

    owner = (await api().post('/api/auth/login').send({ email: 'owner@demo.local', password: 'Demo1234!' })).body.accessToken;
    admin = (await api().post('/api/auth/login').send({ email: 'admin@motordesk.local', password: 'ChangeMe123!' })).body.accessToken;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('rejects unauthenticated requests', async () => {
    await api().get('/api/customers').expect(401);
  });

  it('lists public plans', async () => {
    const res = await api().get('/api/plans').expect(200);
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(['starter', 'professional', 'enterprise']);
  });

  it('keeps tenants isolated', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ businessName: 'Other Garage', name: 'Other', email: 'other@x.lk', password: 'Password1' })
      .expect(201);
    const res = await api().get('/api/customers').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    expect(res.body.total).toBe(0);
    const demo = await api().get('/api/customers').set('Authorization', `Bearer ${owner}`).expect(200);
    expect(demo.body.total).toBe(4);
  });

  it('blocks features outside the plan', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ businessName: 'Starter Garage', name: 'Sunil', email: 's@x.lk', password: 'Password1', planCode: 'starter' })
      .expect(201);
    await api().get('/api/parts').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(403);
  });

  it('completes a job, deducts stock and invoices it', async () => {
    const auth = { Authorization: `Bearer ${owner}` };
    const customer = (await api().get('/api/customers?search=Dilani').set(auth)).body.items[0];
    const vehicle = (await api().get(`/api/vehicles?customer=${customer._id}`).set(auth)).body.items[0];
    const part = (await api().get('/api/parts?search=OIL-5W30').set(auth)).body.items[0];

    const job = (
      await api()
        .post('/api/job-cards')
        .set(auth)
        .send({
          customer: customer._id,
          vehicle: vehicle._id,
          items: [
            { kind: 'labor', description: 'Oil change', unitPrice: 2000 },
            { kind: 'part', description: part.name, part: part._id, quantity: 2, unitPrice: part.sellPrice },
          ],
        })
        .expect(201)
    ).body;
    expect(job.total).toBe(2000 + 2 * part.sellPrice);

    await api().patch(`/api/job-cards/${job._id}/status`).set(auth).send({ status: 'completed' }).expect(200);
    const after = (await api().get(`/api/parts/${part._id}`).set(auth)).body;
    expect(after.quantity).toBe(part.quantity - 2);

    const inv = (await api().post(`/api/job-cards/${job._id}/invoice`).set(auth).expect(201)).body;
    const paid = (await api().post(`/api/invoices/${inv._id}/payments`).set(auth).send({ amount: inv.total }).expect(201)).body;
    expect(paid.status).toBe('paid');

    // Reopening returns the parts to stock.
    await api().patch(`/api/job-cards/${job._id}/status`).set(auth).send({ status: 'in_progress' }).expect(200);
    expect((await api().get(`/api/parts/${part._id}`).set(auth)).body.quantity).toBe(part.quantity);
  });

  it('applies vendor-specific pricing and suspension', async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const tenant = (await api().get('/api/admin/tenants?search=demo').set(auth)).body.items[0];
    const updated = (
      await api().patch(`/api/admin/tenants/${tenant._id}`).set(auth).send({ customPrice: 5000, discountPercent: 20 }).expect(200)
    ).body;
    expect(updated.effectivePrice).toBe(4000);

    await api().patch(`/api/admin/tenants/${tenant._id}`).set(auth).send({ status: 'suspended' }).expect(200);
    await api().post('/api/customers').set('Authorization', `Bearer ${owner}`).send({ name: 'Blocked' }).expect(403);
    await api().get('/api/customers').set('Authorization', `Bearer ${owner}`).expect(200);
    await api().patch(`/api/admin/tenants/${tenant._id}`).set(auth).send({ status: 'active' }).expect(200);
  });

  it('accepts public online bookings', async () => {
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const slots = (await api().get(`/api/public/centers/demo-auto-care/availability?date=${day}`).expect(200)).body;
    expect(slots.length).toBeGreaterThan(0);
    await api()
      .post('/api/public/centers/demo-auto-care/bookings')
      .send({ name: 'Walk In', phone: '0770000000', vehicleNo: 'abc-1111', start: slots[0].start })
      .expect(201);
  });
});
