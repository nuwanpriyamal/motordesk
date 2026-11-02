import { Component, inject, signal } from '@angular/core';
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
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  appName = environment.appName;
  showDemo = environment.name !== 'production';
  email = '';
  password = '';
  busy = signal(false);

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
