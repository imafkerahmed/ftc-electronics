/**
 * Email Service Helper
 * 
 * Supports sending transactional emails using Resend.
 * Fallbacks to console logging in development mode if RESEND_API_KEY is not configured.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  devLog: () => void;
  devFallbackMessage: string;
  prodErrorMessage: string;
}

/**
 * Minimal HTML escaper — prevents attribute/tag injection when user-supplied
 * values (e.g. email address, reset URL) are interpolated into email markup.
 */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Whether the dev-fallback (fake success on send failure) is enabled.
 * Intentionally NOT keyed to NODE_ENV so staging/preview envs see real failures.
 * Set EMAIL_DEV_FALLBACK=true only in local development.
 */
const isDevFallbackEnabled = process.env.EMAIL_DEV_FALLBACK === 'true';

/**
 * Shared Resend transport helper.
 * Handles timeouts, error logging, and development console fallbacks.
 */
async function sendEmail({
  to,
  subject,
  html,
  devLog,
  devFallbackMessage,
  prodErrorMessage,
}: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'FTC Electronics <onboarding@resend.dev>';

  if (!apiKey) {
    if (!isDevFallbackEnabled) {
      // Production (or staging without the flag): refuse to fake a successful send.
      console.error('[EMAIL] RESEND_API_KEY is not configured; refusing to fake a successful send.');
      return { success: false, error: prodErrorMessage };
    }
    // Local dev with EMAIL_DEV_FALLBACK=true: log to console instead.
    devLog();
    return { success: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('[RESEND ERROR]', errorData);

      if (isDevFallbackEnabled) {
        console.log('\n==================================================');
        console.log(`[DEV FALLBACK MAIL SENDER] Resend API failed. ${devFallbackMessage}`);
        console.log(`[DEV FALLBACK MAIL SENDER] Error Details:`, errorData);
        console.log('==================================================\n');
        return { success: true };
      }

      return { success: false, error: prodErrorMessage };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[EMAIL SEND ERROR]', error);

    if (isDevFallbackEnabled) {
      console.log('\n==================================================');
      console.log(`[DEV FALLBACK MAIL SENDER] Network/Timeout error. ${devFallbackMessage}`);
      console.log(`[DEV FALLBACK MAIL SENDER] Error Details: ${errorMsg}`);
      console.log('==================================================\n');
      return { success: true };
    }

    return { success: false, error: 'Network error while attempting to send email.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

interface SendResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: SendResetEmailParams): Promise<{ success: boolean; error?: string }> {
  const safeTo = escapeHtml(to);
  // encodeURI preserves a valid URL while preventing attribute-breaking characters in the href.
  const safeUrl = escapeHtml(encodeURI(resetUrl));

  return sendEmail({
    to,
    subject: 'Reset Your Password - FTC Electronics',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .brand { font-size: 20px; font-weight: 700; color: #09090b; letter-spacing: -0.5px; margin-bottom: 24px; }
            .heading { font-size: 22px; font-weight: 600; color: #18181b; margin-bottom: 12px; }
            .text { font-size: 15px; color: #52525b; line-height: 1.6; margin-bottom: 24px; }
            .button { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; }
            .footer { margin-top: 32px; font-size: 13px; color: #a1a1aa; border-top: 1px solid #f4f4f5; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">FTC Electronics</div>
            <h1 class="heading">Reset your password</h1>
            <p class="text">We received a request to reset the password for your account (${safeTo}). Click the button below to choose a new password. This link will expire in 1 hour.</p>
            <p style="text-align: center; margin: 32px 0;">
              <a href="${safeUrl}" class="button" target="_blank" style="color: #ffffff;">Reset Password</a>
            </p>
            <p class="text" style="font-size: 13px; color: #71717a;">If you didn't request a password reset, you can safely ignore this email.</p>
            <div class="footer">
              <p>If the button above doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${safeUrl}</p>
            </div>
          </div>
        </body>
      </html>
    `,
    devLog: () => {
      console.log('\n==================================================');
      console.log(`[DEV MAIL SENDER] Password Reset requested for: ${to}`);
      console.log(`[DEV MAIL SENDER] Reset URL: ${resetUrl}`);
      console.log('==================================================\n');
    },
    devFallbackMessage: `Reset URL for: ${to}\n[DEV FALLBACK MAIL SENDER] Reset URL: ${resetUrl}`,
    prodErrorMessage: 'Failed to send reset email.',
  });
}

interface SendOtpEmailParams {
  to: string;
  code: string;
  expiresMinutes?: number;
}

export async function sendOtpEmail({ to, code, expiresMinutes = 10 }: SendOtpEmailParams): Promise<{ success: boolean; error?: string }> {
  const safeTo = escapeHtml(to);

  return sendEmail({
    to,
    subject: `Verify Your Account: ${code} - FTC Electronics`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .brand { font-size: 20px; font-weight: 700; color: #09090b; letter-spacing: -0.5px; margin-bottom: 24px; }
            .heading { font-size: 22px; font-weight: 600; color: #18181b; margin-bottom: 12px; }
            .text { font-size: 15px; color: #52525b; line-height: 1.6; margin-bottom: 24px; }
            .otp-box { font-size: 32px; font-weight: 800; letter-spacing: 6px; text-align: center; color: #2563eb; background-color: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0; border: 1px dashed #bfdbfe; font-family: Courier, monospace; }
            .footer { margin-top: 32px; font-size: 13px; color: #a1a1aa; border-top: 1px solid #f4f4f5; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">FTC Electronics</div>
            <h1 class="heading">Verify your email address</h1>
            <p class="text">Thank you for creating an account. Please use the following One-Time Password (OTP) to complete your registration. This code will expire in ${expiresMinutes} minutes.</p>
            <div class="otp-box">${code}</div>
            <p class="text" style="font-size: 13px; color: #71717a;">If you didn't initiate this sign-up request, you can safely ignore this email.</p>
            <div class="footer">
              <p>© ${new Date().getFullYear()} FTC Electronics. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    devLog: () => {
      console.log('\n==================================================');
      console.log(`[DEV MAIL SENDER] OTP Code for: ${to}`);
      console.log(`[DEV MAIL SENDER] Code: ${code} (Expires in ${expiresMinutes} mins)`);
      console.log('==================================================\n');
    },
    devFallbackMessage: `Code for: ${safeTo}\n[DEV FALLBACK MAIL SENDER] Code: ${code}`,
    prodErrorMessage: 'Failed to send OTP email.',
  });
}
