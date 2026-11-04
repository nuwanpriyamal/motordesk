import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Observable, Subject, filter, map } from 'rxjs';
import { CacheService } from '../cache/cache.service';

export interface RealtimeEvent {
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  at: number;
}

/**
 * Publishes tenant events to Firebase Realtime Database when configured
 * (FIREBASE_SERVICE_ACCOUNT + FIREBASE_DATABASE_URL), and always to an
 * in-process stream that backs the SSE fallback endpoint.
 */
@Injectable()
export class RealtimeService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly events$ = new Subject<RealtimeEvent>();
  private app?: admin.app.App;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    const databaseURL = this.config.get<string>('FIREBASE_DATABASE_URL');
    if (!raw || !databaseURL) {
      this.logger.log('Firebase not configured, realtime uses SSE only');
      return;
    }
    try {
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      this.app = admin.initializeApp(
        { credential: admin.credential.cert(JSON.parse(json)), databaseURL },
        'realtime',
      );
      this.logger.log('Firebase Realtime Database enabled');
    } catch (e) {
      this.logger.error(`Firebase init failed: ${(e as Error).message}`);
    }
  }

  get firebaseEnabled() {
    return !!this.app;
  }

  publish(tenantId: string, type: string, payload: Record<string, unknown> = {}) {
    const event: RealtimeEvent = { tenantId, type, payload, at: Date.now() };
    // Anything worth broadcasting also changes the dashboard numbers.
    void this.cache.del(`dash:${tenantId}`);
    this.events$.next(event);
    if (!this.app) return;
    const write = Promise.resolve(
      this.app
        .database()
        .ref(`tenants/${tenantId}/events`)
        .push({ type, payload, at: admin.database.ServerValue.TIMESTAMP }),
    )
      .catch((e) => this.logger.warn(`Firebase publish failed: ${e.message}`))
      .finally(() => this.pending.delete(write));
    this.pending.add(write);
  }

  /**
   * Waits for outstanding Firebase writes. Serverless hosts freeze the function
   * once the response is sent, so the flush interceptor calls this first.
   */
  async flush() {
    await Promise.allSettled([...this.pending]);
  }

  stream(tenantId: string): Observable<{ data: RealtimeEvent }> {
    return this.events$.pipe(
      filter((e) => e.tenantId === tenantId),
      map((data) => ({ data })),
    );
  }

  /** Custom token so the browser can sign in to Firebase and read only its tenant's node. */
  async createToken(userId: string, tenantId: string): Promise<string | null> {
    if (!this.app) return null;
    return this.app.auth().createCustomToken(userId, { tenantId });
  }
}
