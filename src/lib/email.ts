/**
 * Email Service Helper
 * 
 * Supports sending transactional emails using Resend.
 * Fallbacks to console logging in development mode if RESEND_API_KEY is not configured.
 */

interface SendResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: SendResetEmailParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'FTC Electronics <onboarding@resend.dev>';

  // Dev / Fallback log if Resend API key is not configured
  if (!apiKey) {
    console.log('\n==================================================');
    console.log(`[DEV MAIL SENDER] Password Reset requested for: ${to}`);
    console.log(`[DEV MAIL SENDER] Reset URL: ${resetUrl}`);
    console.log('==================================================\n');
    return { success: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

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
                <p class="text">We received a request to reset the password for your account (${to}). Click the button below to choose a new password. This link will expire in 1 hour.</p>
                <p style="text-align: center; margin: 32px 0;">
                  <a href="${resetUrl}" class="button" target="_blank" style="color: #ffffff;">Reset Password</a>
                </p>
                <p class="text" style="font-size: 13px; color: #71717a;">If you didn't request a password reset, you can safely ignore this email.</p>
                <div class="footer">
                  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('[RESEND ERROR]', errorData);

      if (process.env.NODE_ENV !== 'production') {
        console.log('\n==================================================');
        console.log(`[DEV FALLBACK MAIL SENDER] Resend API failed. Reset URL for: ${to}`);
        console.log(`[DEV FALLBACK MAIL SENDER] Reset URL: ${resetUrl}`);
        console.log(`[DEV FALLBACK MAIL SENDER] Error Details:`, errorData);
        console.log('==================================================\n');
        return { success: true };
      }

      return { success: false, error: errorData.message || 'Failed to send reset email.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL SEND ERROR]', error);

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n==================================================');
      console.log(`[DEV FALLBACK MAIL SENDER] Network/Timeout error. Reset URL for: ${to}`);
      console.log(`[DEV FALLBACK MAIL SENDER] Reset URL: ${resetUrl}`);
      console.log(`[DEV FALLBACK MAIL SENDER] Error Details: ${error?.message || error}`);
      console.log('==================================================\n');
      return { success: true };
    }

    return { success: false, error: 'Network error while attempting to send reset email.' };
  }
}

interface SendOtpEmailParams {
  to: string;
  code: string;
  expiresMinutes?: number;
}

export async function sendOtpEmail({ to, code, expiresMinutes = 10 }: SendOtpEmailParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'FTC Electronics <onboarding@resend.dev>';

  // Dev / Fallback log if Resend API key is not configured
  if (!apiKey) {
    console.log('\n==================================================');
    console.log(`[DEV MAIL SENDER] OTP Code for: ${to}`);
    console.log(`[DEV MAIL SENDER] Code: ${code} (Expires in ${expiresMinutes} mins)`);
    console.log('==================================================\n');
    return { success: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

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
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('[RESEND ERROR]', errorData);

      if (process.env.NODE_ENV !== 'production') {
        console.log('\n==================================================');
        console.log(`[DEV FALLBACK MAIL SENDER] Resend API failed. Code for: ${to}`);
        console.log(`[DEV FALLBACK MAIL SENDER] Code: ${code}`);
        console.log(`[DEV FALLBACK MAIL SENDER] Error Details:`, errorData);
        console.log('==================================================\n');
        return { success: true };
      }

      return { success: false, error: errorData.message || 'Failed to send OTP email.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL SEND ERROR]', error);

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n==================================================');
      console.log(`[DEV FALLBACK MAIL SENDER] Network/Timeout error. Code for: ${to}`);
      console.log(`[DEV FALLBACK MAIL SENDER] Code: ${code}`);
      console.log(`[DEV FALLBACK MAIL SENDER] Error Details: ${error?.message || error}`);
      console.log('==================================================\n');
      return { success: true };
    }

    return { success: false, error: 'Network error while attempting to send OTP email.' };
  }
}
