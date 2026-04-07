import { Resend } from 'resend';
import { AppError } from '../middleware/errorHandler';

export type ResendDnsRecord = {
  record: string;
  name: string;
  type: string;
  ttl: string;
  value: string;
  priority?: number;
};

export type ResendDomain = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  records?: ResendDnsRecord[];
};

function mustEnv(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) throw new AppError(500, `Missing environment variable: ${name}`);
  return v;
}

function isValidEmailish(v: string): boolean {
  // We intentionally keep this lightweight; Resend will still validate.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export class EmailService {
  private readonly resend: Resend;
  readonly platformFrom: string;

  constructor(opts?: { apiKey?: string; platformFrom?: string }) {
    const apiKey = (opts?.apiKey ?? process.env.RESEND_API_KEY ?? '').trim();
    if (!apiKey) throw new AppError(500, 'Missing RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    this.platformFrom = (opts?.platformFrom ?? mustEnv('PLATFORM_FROM_EMAIL')).trim();
  }

  async sendEmail(opts: { from: string; to: string; subject: string; html: string }): Promise<string> {
    const from = String(opts.from ?? '').trim();
    const to = String(opts.to ?? '').trim();
    const subject = String(opts.subject ?? '').trim();
    const html = String(opts.html ?? '').trim();

    if (!from || !to || !subject || !html) {
      throw new AppError(400, 'Missing email fields');
    }
    if (!isValidEmailish(from) || !isValidEmailish(to)) {
      throw new AppError(400, 'Invalid email address');
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
      });

      if (error) {
        throw new AppError(502, error.message ?? 'Resend error');
      }
      const id = (data as { id?: string } | null)?.id;
      if (!id) throw new AppError(502, 'Resend did not return message id');
      return id;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to send email: ${msg}`);
    }
  }

  async createDomain(domain: string): Promise<{ id: string; records: ResendDnsRecord[] }> {
    const name = String(domain ?? '').toLowerCase().trim();
    if (!name) throw new AppError(400, 'domain is required');

    try {
      const { data, error } = await this.resend.domains.create({ name });
      if (error) throw new AppError(502, error.message ?? 'Resend error');
      const d = data as ResendDomain | null;
      if (!d?.id) throw new AppError(502, 'Resend did not return domain id');
      return { id: d.id, records: (d.records ?? []) as ResendDnsRecord[] };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to create domain: ${msg}`);
    }
  }

  async verifyDomain(resendDomainId: string): Promise<{ verified: boolean; domain?: ResendDomain }> {
    const id = String(resendDomainId ?? '').trim();
    if (!id) throw new AppError(400, 'domainId is required');

    try {
      const { data, error } = await this.resend.domains.verify(id);
      if (error) throw new AppError(502, error.message ?? 'Resend error');
      const d = data as unknown as ResendDomain | null;
      const verified = String(d?.status ?? '').toLowerCase() === 'verified';
      return { verified, domain: d ?? undefined };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to verify domain: ${msg}`);
    }
  }

  async listDomains(): Promise<ResendDomain[]> {
    try {
      const { data, error } = await this.resend.domains.list();
      if (error) throw new AppError(502, error.message ?? 'Resend error');
      const list = (data as { data?: ResendDomain[] } | ResendDomain[] | null) ?? [];
      if (Array.isArray(list)) return list;
      return (list.data ?? []) as ResendDomain[];
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to list domains: ${msg}`);
    }
  }

  async deleteDomain(resendDomainId: string): Promise<void> {
    const id = String(resendDomainId ?? '').trim();
    if (!id) throw new AppError(400, 'domainId is required');

    // Resend docs historically used DELETE /domains/:id, but the SDK may expose `remove` or `delete`.
    // We support both shapes to avoid pinning behavior.
    const anyDomains = this.resend.domains as unknown as {
      remove?: (id: string) => Promise<{ data?: unknown; error?: { message?: string } }>;
      delete?: (id: string) => Promise<{ data?: unknown; error?: { message?: string } }>;
    };

    try {
      if (typeof anyDomains.remove === 'function') {
        const { error } = await anyDomains.remove(id);
        if (error) throw new AppError(502, error.message ?? 'Resend error');
        return;
      }
      if (typeof anyDomains.delete === 'function') {
        const { error } = await anyDomains.delete(id);
        if (error) throw new AppError(502, error.message ?? 'Resend error');
        return;
      }
      throw new AppError(500, 'Resend SDK does not support domain deletion');
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to delete domain: ${msg}`);
    }
  }
}

