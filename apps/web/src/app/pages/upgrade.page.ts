import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  imports: [RouterLink],
  template: `
    <div class="card card-pad stack" style="max-width: 560px; margin: 40px auto; text-align: center">
      <h1>Not included in your plan</h1>
      <p class="muted">This module is not part of the {{ auth.tenant()?.entitlements?.planName }} plan. Contact the platform team to upgrade and unlock it.</p>
      <div class="row" style="justify-content: center">
        <a class="btn btn-ghost" routerLink="/app/settings">View my plan</a>
        <a class="btn" routerLink="/app/jobs">Back to job cards</a>
      </div>
    </div>
  `,
})
export class UpgradePage {
  auth = inject(AuthService);
}
