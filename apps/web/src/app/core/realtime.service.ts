import { Injectable, inject, signal } from '@angular/core';
import { Subject, filter } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface RealtimeEvent {
  type: string;
  payload: Record<string, unknown>;
  at: number;
}

interface RealtimeConfig {
  enabled: boolean;
  token: string | null;
  tenantId: string;
  /** False on serverless hosts, where only Firebase can push events. */
  sse?: boolean;
  web: Record<string, string> | null;
}

/**
 * Live tenant events. Uses Firebase Realtime Database when the API has it
 * configured, otherwise the API's server-sent events stream.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private events$ = new Subject<RealtimeEvent>();
  private stop?: () => void;

  readonly mode = signal<'off' | 'firebase' | 'sse'>('off');

  on(prefix: string) {
    return this.events$.pipe(filter((e) => e.type.startsWith(prefix)));
  }

  connect() {
    if (this.stop) return;
    this.api.get<RealtimeConfig>('/realtime/config').subscribe({
      next: (cfg) => {
        if (cfg.enabled && cfg.web && cfg.token) this.connectFirebase(cfg);
        else if (cfg.sse !== false) this.connectSse();
      },
      error: () => this.connectSse(),
    });
  }

  disconnect() {
    this.stop?.();
    this.stop = undefined;
    this.mode.set('off');
  }

  private async connectFirebase(cfg: RealtimeConfig) {
    try {
      const [{ initializeApp, getApps }, { getAuth, signInWithCustomToken }, db] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/database'),
      ]);
      const app = getApps()[0] ?? initializeApp(cfg.web!);
      await signInWithCustomToken(getAuth(app), cfg.token!);
      const since = Date.now();
      const ref = db.query(db.ref(db.getDatabase(app), `tenants/${cfg.tenantId}/events`), db.orderByChild('at'), db.startAt(since));
      const unsub = db.onChildAdded(ref, (snap) => this.events$.next(snap.val() as RealtimeEvent));
      this.stop = () => unsub();
      this.mode.set('firebase');
    } catch (e) {
      console.warn('Firebase realtime unavailable, falling back to SSE', e);
      this.connectSse();
    }
  }

  private connectSse() {
    const token = this.auth.token();
    if (!token || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${this.api.base}/realtime/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as RealtimeEvent;
        if (data?.type) this.events$.next(data);
      } catch {
        /* keep-alive */
      }
    };
    this.stop = () => es.close();
    this.mode.set('sse');
  }
}
