import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendResult {
  ok: boolean;
  provider: string;
  error?: string;
}

/**
 * Sends SMS through Notify.lk when NOTIFY_LK_* env vars are set; otherwise logs
 * the message (useful in dev and the testing environment).
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(private readonly config: ConfigService) {}

  private normalizePhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('94')) return digits;
    if (digits.startsWith('0')) return `94${digits.slice(1)}`;
    return digits;
  }

  async sms(to: string, message: string, senderId?: string): Promise<SendResult> {
    const userId = this.config.get<string>('NOTIFY_LK_USER_ID');
    const apiKey = this.config.get<string>('NOTIFY_LK_API_KEY');
    const sender = senderId || this.config.get<string>('NOTIFY_LK_SENDER_ID', 'NotifyDEMO');
    if (!userId || !apiKey) {
      this.logger.log(`[sms:log] to=${to} :: ${message}`);
      return { ok: true, provider: 'log' };
    }
    const url = new URL('https://app.notify.lk/api/v1/send');
    url.search = new URLSearchParams({
      user_id: userId,
      api_key: apiKey,
      sender_id: sender,
      to: this.normalizePhone(to),
      message,
    }).toString();
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as { status?: string; errors?: unknown };
      if (!res.ok || body.status !== 'success') {
        return { ok: false, provider: 'notify.lk', error: JSON.stringify(body.errors ?? body) };
      }
      return { ok: true, provider: 'notify.lk' };
    } catch (e) {
      return { ok: false, provider: 'notify.lk', error: (e as Error).message };
    }
  }

  async email(to: string, subject: string, message: string): Promise<SendResult> {
    // Email delivery is not wired to a provider yet; logged so reminders still flow.
    this.logger.log(`[email:log] to=${to} subject="${subject}" :: ${message}`);
    return { ok: true, provider: 'log' };
  }
}
