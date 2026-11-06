import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { PublicHeaderComponent } from './public-header';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, PublicHeaderComponent],
  styles: `
    .wrap { max-width: 420px; margin: 48px auto; padding: 0 16px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    .or { display: flex; align-items: center; gap: 10px; margin: 16px 0; color: var(--muted, #888); font-size: 13px; }
    .or::before, .or::after { content: ''; flex: 1; border-top: 1px solid currentColor; opacity: 0.3; }
    .google { display: flex; align-items: center; justify-content: center; gap: 10px; }
  `,
  template: `
    <app-public-header />
    <div class="wrap">
      <div class="card card-pad">
        <h1>Log in</h1>
        <p class="muted">Welcome back to {{ appName }}.</p>
        <form (ngSubmit)="submit()">
          <label class="field">Email
            <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
          </label>
          <label class="field">Password
            <input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
          </label>
          <button class="btn btn-block" type="submit" [disabled]="busy() || !email || !password">
            {{ busy() ? 'Signing in…' : 'Log in' }}
          </button>
        </form>
        @if (googleConfig()) {
          <div class="or">or</div>
          <button class="btn btn-ghost btn-block google" type="button" (click)="google()" [disabled]="busy()">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>
        }
        <p class="muted small" style="margin-top: 16px">
          New service center? <a routerLink="/register">Create an account</a>
        </p>
      </div>
      @if (showDemo) {
        <div class="alert small" style="margin-top: 14px">
          Demo account: <span class="mono">owner&#64;demo.local</span> / <span class="mono">Demo1234!</span>
          <button class="btn btn-ghost btn-sm" style="margin-left: 8px" (click)="fillDemo()">Use</button>
        </div>
      }
    </div>
  `,
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  appName = environment.appName;
  showDemo = environment.name !== 'production';
  email = '';
  password = '';
  busy = signal(false);
  googleConfig = signal<Record<string, string> | null>(null);

  ngOnInit() {
    this.auth.providers().subscribe({
      next: (p) => this.googleConfig.set(p.google ? p.firebase : null),
      error: () => this.googleConfig.set(null),
    });
  }

  async google() {
    const cfg = this.googleConfig();
    if (!cfg) return;
    this.busy.set(true);
    let idToken: string;
    try {
      idToken = await this.auth.googleIdToken(cfg);
    } catch (e) {
      this.busy.set(false);
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        this.toast.error('Google sign-in did not complete. Please try again.');
      }
      return;
    }
    this.auth.loginWithGoogle(idToken).subscribe({
      next: () => this.router.navigateByUrl(this.auth.homeUrl()),
      error: (e) => {
        this.busy.set(false);
        if (e?.status === 404 && e?.error?.code === 'NO_ACCOUNT') {
          // New to MotorDesk: finish sign-up with the Google account.
          this.toast.show('No account for that Google email yet. Add your business details to create one.', 'info', 6000);
          this.router.navigate(['/register'], {
            state: { googleIdToken: idToken, email: e.error.email, name: e.error.name },
          });
          return;
        }
        this.toast.error(e);
      },
    });
  }

  fillDemo() {
    this.email = 'owner@demo.local';
    this.password = 'Demo1234!';
  }

  submit() {
    this.busy.set(true);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.homeUrl()),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
