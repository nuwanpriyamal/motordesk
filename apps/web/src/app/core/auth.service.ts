import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthUser, Tenant } from './models';

const TOKEN_KEY = 'md_token';
const USER_KEY = 'md_user';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly token = signal<string | null>(read<string>(TOKEN_KEY));
  readonly user = signal<AuthUser | null>(read<AuthUser>(USER_KEY));
  readonly tenant = signal<Tenant | null>(null);

  readonly isLoggedIn = computed(() => !!this.token());
  readonly isSuperAdmin = computed(() => this.user()?.role === 'super_admin');
  readonly features = computed(() => new Set(this.tenant()?.entitlements?.features ?? []));

  private store(res: { accessToken: string; user: AuthUser }) {
    this.token.set(res.accessToken);
    this.user.set(res.user);
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(res.accessToken));
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } catch {
      /* private mode: session lasts until reload */
    }
  }

  login(email: string, password: string): Observable<{ accessToken: string; user: AuthUser }> {
    return this.api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password }).pipe(tap((r) => this.store(r)));
  }

  /** Asks the API whether Google sign-in is available, with the Firebase config it needs. */
  providers() {
    return this.api.get<{ google: boolean; firebase: Record<string, string> | null }>('/auth/providers');
  }

  /**
   * Opens Google's sign-in popup through Firebase and returns the ID token.
   * The Firebase session is dropped right away; MotorDesk uses its own token.
   */
  async googleIdToken(firebase: Record<string, string>): Promise<string> {
    const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const auth = getAuth(getApps()[0] ?? initializeApp(firebase));
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken();
    await signOut(auth);
    return idToken;
  }

  loginWithGoogle(idToken: string) {
    return this.api.post<{ accessToken: string; user: AuthUser }>('/auth/google', { idToken }).pipe(tap((r) => this.store(r)));
  }

  register(body: Record<string, unknown>) {
    return this.api.post<{ accessToken: string; user: AuthUser }>('/auth/register', body).pipe(tap((r) => this.store(r)));
  }

  loadTenant() {
    return this.api.get<Tenant>('/tenant').pipe(tap((t) => this.tenant.set(t)));
  }

  has(feature: string) {
    return this.features().has(feature);
  }

  can(...roles: string[]) {
    const role = this.user()?.role;
    return role === 'super_admin' || (!!role && roles.includes(role));
  }

  logout() {
    this.token.set(null);
    this.user.set(null);
    this.tenant.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    this.router.navigateByUrl('/login');
  }

  homeUrl() {
    return this.isSuperAdmin() ? '/admin' : '/app';
  }
}
