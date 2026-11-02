import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Paginated } from './models';

type Query = Record<string, string | number | boolean | undefined | null>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly base = environment.apiUrl;

  private params(q?: Query) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(q ?? {})) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }

  get<T>(path: string, q?: Query): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, { params: this.params(q) });
  }

  list<T>(path: string, q?: Query): Observable<Paginated<T>> {
    return this.get<Paginated<T>>(path, q);
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body);
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`);
  }
}

/** Turns a Nest error response into one readable line. */
export function errorMessage(err: unknown): string {
  const e = err as { error?: { message?: string | string[] }; message?: string; status?: number };
  if (e?.status === 0) return 'Cannot reach the server. Check your connection.';
  const m = e?.error?.message ?? e?.message ?? 'Something went wrong';
  return Array.isArray(m) ? m.join(', ') : m;
}
