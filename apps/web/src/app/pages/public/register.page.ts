import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';
import { PublicHeaderComponent } from './public-header';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, PublicHeaderComponent, ...UI],
  styles: `
    .wrap { max-width: 560px; margin: 40px auto; padding: 0 16px; }
    form { margin-top: 16px; }
  `,
  template: `
    <app-public-header />
    <div class="wrap">
      <div class="card card-pad">
        <h1>Create your service center</h1>
        <p class="muted">Start a free trial. You can change your plan at any time.</p>
        <form class="grid-2" (ngSubmit)="submit()">
          <label class="field span-all">Business name
            <input name="businessName" [(ngModel)]="form.businessName" required minlength="2" />
          </label>
          <label class="field">Your name
            <input name="name" [(ngModel)]="form.name" required minlength="2" autocomplete="name" />
          </label>
          <label class="field">Phone
            <input name="phone" [(ngModel)]="form.phone" autocomplete="tel" />
          </label>
          <label class="field">Email @if (googleIdToken) { <span class="hint">From your Google account</span> }
            <input type="email" name="email" [(ngModel)]="form.email" required autocomplete="email" [readonly]="!!googleIdToken" />
          </label>
          <label class="field">City
            <input name="city" [(ngModel)]="form.city" />
          </label>
          @if (!googleIdToken) {
            <label class="field span-all">Password <span class="hint">At least 8 characters</span>
              <input type="password" name="password" [(ngModel)]="form.password" required minlength="8" autocomplete="new-password" />
            </label>
          }
          <label class="field span-all">Plan
            <select name="planCode" [(ngModel)]="form.planCode">
              @for (p of plans(); track p._id) {
                <option [value]="p.code">{{ p.name }} — {{ p.monthlyPrice | money: p.currency }}/month · {{ p.trialDays }}-day trial</option>
              }
            </select>
          </label>
          <div class="span-all">
            <button class="btn btn-block" type="submit" [disabled]="busy() || !valid()">
              {{ busy() ? 'Creating account…' : 'Start free trial' }}
            </button>
          </div>
        </form>
        <p class="muted small" style="margin-top: 16px">Already registered? <a routerLink="/login">Log in</a></p>
      </div>
    </div>
  `,
})
export class RegisterPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  plans = signal<Plan[]>([]);
  busy = signal(false);
  form = { businessName: '', name: '', email: '', phone: '', city: '', password: '', planCode: '' };
  /** Set when the user arrives from "Continue with Google" without an account. */
  googleIdToken: string | null = null;

  ngOnInit() {
    const g = history.state as { googleIdToken?: string; email?: string; name?: string } | null;
    if (g?.googleIdToken) {
      this.googleIdToken = g.googleIdToken;
      this.form.email = g.email ?? '';
      this.form.name = g.name ?? '';
    }
    const wanted = this.route.snapshot.queryParamMap.get('plan');
    this.api.get<Plan[]>('/plans').subscribe({
      next: (p) => {
        this.plans.set(p);
        this.form.planCode = p.find((x) => x.code === wanted)?.code ?? p[0]?.code ?? '';
      },
      error: (e) => this.toast.error(e),
    });
  }

  valid() {
    const f = this.form;
    return f.businessName.trim().length >= 2 && f.name.trim().length >= 2 && f.email.includes('@') && (!!this.googleIdToken || f.password.length >= 8);
  }

  submit() {
    this.busy.set(true);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.form)) if (v.trim()) body[k] = v.trim();
    if (this.googleIdToken) {
      delete body['password'];
      body['googleIdToken'] = this.googleIdToken;
    } else {
      body['password'] = this.form.password;
    }
    this.auth.register(body).subscribe({
      next: () => this.router.navigateByUrl('/app'),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
