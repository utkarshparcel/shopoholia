/**
 * The site's Worker. Cloudflare runs it in front of the static export for /api/* only
 * (wrangler.jsonc: assets.run_worker_first); every other request is served straight from ./out.
 *
 * POST /api/join: the early-access form on / and /closet (WaitlistForm). The sign-up is emailed to
 * the inbox in the JOIN_TO secret through the send_email binding, from hello@worncloset.app, with
 * the visitor as reply-to. Sending to a verified Email Routing destination address is free.
 */

interface EmailAddress {
  email: string;
  name?: string;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  EMAIL: {
    send(message: {
      to: string | EmailAddress;
      from: string | EmailAddress;
      replyTo?: string | EmailAddress;
      subject: string;
      text: string;
    }): Promise<{ messageId: string }>;
  };
  JOIN_RATE_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Where sign-ups go: a verified Email Routing destination address (`wrangler secret put JOIN_TO`). */
  JOIN_TO?: string;
}

const FROM: EmailAddress = { email: 'hello@worncloset.app', name: 'Worn website' };
const LISTS = { play: 'Worn Play', closet: 'Worn Closet' } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s().-]+$/;
const MAX_BODY = 8 * 1024;

type List = keyof typeof LISTS;
type Submission = { name: string; email: string; phone: string; list: List; page: string; referrer: string };
type Parsed = { ok: true; value: Submission; bot: boolean } | { ok: false; error: string };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Checks the posted fields; `bot` is a filled honeypot, answered like a success and dropped. */
function parse(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const fields = body as Record<string, unknown>;
  // one line, no control characters (they would otherwise reach the mail headers), capped
  const text = (key: string, max: number) =>
    typeof fields[key] === 'string' ? (fields[key] as string).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';
  const name = text('name', 120);
  const email = text('email', 254);
  const phone = text('phone', 32);
  const list = text('list', 16);
  const digits = phone.replace(/\D/g, '').length;
  if (!name) return { ok: false, error: 'name' };
  if (!EMAIL.test(email)) return { ok: false, error: 'email' };
  if (!PHONE.test(phone) || digits < 7 || digits > 15) return { ok: false, error: 'phone' };
  if (!(list in LISTS)) return { ok: false, error: 'list' };
  return {
    ok: true,
    bot: text('website', 8) !== '',
    value: { name, email, phone, list: list as List, page: text('page', 200), referrer: text('referrer', 500) },
  };
}

async function join(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, { allow: 'POST' });
  // The form posts from the site itself; a page elsewhere gets nothing.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'origin' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const parsed = parse(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  if (parsed.bot) return json({ ok: true });

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.JOIN_RATE_LIMIT.limit({ key: ip });
  if (!success) return json({ ok: false, error: 'rate_limited' }, 429, { 'retry-after': '60' });

  if (!env.JOIN_TO) {
    console.error('join: the JOIN_TO secret is not set');
    return json({ ok: false, error: 'unconfigured' }, 500);
  }

  const s = parsed.value;
  const product = LISTS[s.list];
  const text = [
    `New ${product} early-access sign-up`,
    '',
    `Name:   ${s.name}`,
    `Email:  ${s.email}`,
    `Phone:  ${s.phone}`,
    '',
    `List:     ${s.list}`,
    `Page:     ${s.page || '(unknown)'}`,
    `Referrer: ${s.referrer || '(none)'}`,
    `Country:  ${request.headers.get('cf-ipcountry') ?? '(unknown)'}`,
    `Time:     ${new Date().toISOString()}`,
    '',
    'Reply to this email to reach them.',
  ].join('\n');

  try {
    await env.EMAIL.send({
      to: env.JOIN_TO,
      from: FROM,
      replyTo: { email: s.email, name: s.name },
      subject: `New ${product} sign-up: ${s.name}`,
      text,
    });
  } catch (err) {
    console.error('join: send failed', err);
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/join') return join(request, env);
    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
