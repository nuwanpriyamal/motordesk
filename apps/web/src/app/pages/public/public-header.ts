import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

/** Simple header for pages outside the app shell. */
@Component({
  selector: 'app-public-header',
  imports: [RouterLink],
  styles: `
    header { background: var(--surface); border-bottom: 1px solid var(--border); }
    .inner { max-width: 1100px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 17px; color: var(--text); }
    .brand:hover { text-decoration: none; }
    .logo { width: 28px; height: 28px; border-radius: 7px; background: var(--primary); color: #fff; display: grid; place-items: center; font-size: 14px; }
  `,
  template: `
    <header>
      <div class="inner">
        <a class="brand" routerLink="/"><span class="logo">M</span>{{ appName }}</a>
        <span class="spacer"></span>
        @if (auth.isLoggedIn()) {
          <a class="btn btn-sm" [routerLink]="auth.homeUrl()">Open app</a>
        } @else {
          <a class="btn btn-ghost btn-sm" routerLink="/login">Log in</a>
          <a class="btn btn-sm" routerLink="/register">Get started</a>
        }
      </div>
    </header>
  `,
})
export class PublicHeaderComponent {
  auth = inject(AuthService);
  appName = environment.appName;
}
