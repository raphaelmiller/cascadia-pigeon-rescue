// Magic-link issuance + verification.
//
// Flow:
//   1. Volunteer enters their email on /v/login.
//   2. We look up VolunteerProfile by email. If none \u2192 generic success
//      message (no enumeration). If exists and not disabled \u2192 issue
//      token.
//   3. Token = 32 random bytes, URL-safe base64. We store SHA-256 hash.
//   4. We email the volunteer https://volunteer.HOST/v/auth/callback?t=<raw>
//   5. On callback: hash the param, look up unconsumed unexpired row,
//      mark consumed, set session cookie, redirect.
//
// 30-minute TTL. Single-use. Audit fields (issuedIp, issuedUa) stored
// for forensics.

import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/notify/email';

const TTL_MS = 30 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function randomToken(): string {
  // 32 bytes -> 43 base64url chars. URL-safe.
  return randomBytes(32).toString('base64url');
}

export type IssueOptions = {
  email: string;
  redirectTo?: string;
  ip?: string | null;
  userAgent?: string | null;
  /** Origin to embed in the email URL, e.g. "https://volunteer.cpr.org". */
  origin: string;
};

export type IssueResult =
  | { ok: true; emailMode: string }
  | { ok: false; reason: 'no_account' | 'disabled' | 'send_failed'; error?: string };

/**
 * Issue a magic link and email it. Always returns ok-shaped data to the
 * caller's caller (don't leak existence of accounts to the user); the
 * `reason` field is for server-side logging only.
 */
export async function issueMagicLink(opts: IssueOptions): Promise<IssueResult> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'no_account' };
  }
  const profile = await prisma.volunteerProfile.findUnique({ where: { email } });
  if (!profile) return { ok: false, reason: 'no_account' };
  if (profile.disabledAt) return { ok: false, reason: 'disabled' };

  const raw = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.volunteerMagicLink.create({
    data: {
      profileId: profile.id,
      tokenHash: hashToken(raw),
      redirectTo: opts.redirectTo && opts.redirectTo.startsWith('/') ? opts.redirectTo : '/',
      issuedIp: opts.ip ?? null,
      issuedUa: opts.userAgent?.slice(0, 200) ?? null,
      expiresAt,
    },
  });

  const url = `${opts.origin.replace(/\/$/, '')}/v/auth/callback?t=${encodeURIComponent(raw)}`;
  const result = await sendEmail({
    to: email,
    tag: 'magic-link',
    subject: 'Your CPR Volunteer sign-in link',
    text:
      `Hi ${profile.name || 'there'},\n\n` +
      `Tap the link below to sign in to the CPR volunteer portal:\n\n` +
      `${url}\n\n` +
      `This link expires in 30 minutes and can only be used once.\n\n` +
      `If you didn't request this, you can ignore this message.\n\n` +
      `\u2014 Cascadia Pigeon Rescue`,
    html:
      `<p>Hi ${profile.name || 'there'},</p>` +
      `<p>Tap the link below to sign in to the CPR volunteer portal:</p>` +
      `<p><a href="${url}" style="display:inline-block;padding:10px 16px;` +
        `background:#0f766e;color:#fff;border-radius:8px;text-decoration:none;` +
        `font-weight:600">Sign in to CPR</a></p>` +
      `<p style="color:#6b7280;font-size:12px">This link expires in 30 minutes ` +
      `and can only be used once.</p>`,
  });
  if (!result.ok) {
    return { ok: false, reason: 'send_failed', error: result.error };
  }
  return { ok: true, emailMode: result.mode };
}

export type ConsumeResult =
  | { ok: true; profileId: string; redirectTo: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'disabled' };

/** Verify + consume a magic-link token. Single-use, single-check. */
export async function consumeMagicLink(rawToken: string): Promise<ConsumeResult> {
  if (!rawToken) return { ok: false, reason: 'invalid' };
  const tokenHash = hashToken(rawToken);
  const row = await prisma.volunteerMagicLink.findUnique({
    where: { tokenHash },
    include: { profile: true },
  });
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.consumedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt < new Date()) return { ok: false, reason: 'expired' };
  if (row.profile.disabledAt) return { ok: false, reason: 'disabled' };

  await prisma.$transaction([
    prisma.volunteerMagicLink.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
    prisma.volunteerProfile.update({
      where: { id: row.profile.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);
  return { ok: true, profileId: row.profile.id, redirectTo: row.redirectTo };
}
