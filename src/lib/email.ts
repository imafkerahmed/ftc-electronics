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

interface SendQuotationEmailParams {
  to: string;
  quoteNumber: string;
  customerName: string;
  customerCompany?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: Array<{ name: string; qty: number; unitPrice: number; discount: number }>;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  validUntil: string;
  notes?: string;
  storeName?: string;
  storePhone?: string;
  storeEmail?: string;
  storeAddress?: string;
}

export async function sendQuotationEmail(params: SendQuotationEmailParams): Promise<{ success: boolean; error?: string }> {
  const safeTo = escapeHtml(params.to);
  const safeQuoteNumber = escapeHtml(params.quoteNumber);
  const safeCustomerName = escapeHtml(params.customerName);
  const safeCustomerCompany = params.customerCompany ? escapeHtml(params.customerCompany) : '';
  const safeCustomerPhone = params.customerPhone ? escapeHtml(params.customerPhone) : '';
  const safeCustomerAddress = params.customerAddress ? escapeHtml(params.customerAddress) : '';
  const safeValidUntil = escapeHtml(params.validUntil);
  const safeNotes = params.notes ? escapeHtml(params.notes) : '';

  const safeStoreName = escapeHtml(params.storeName || 'FTC Electronics');
  const safeStorePhone = params.storePhone ? escapeHtml(params.storePhone) : '';
  const safeStoreEmail = params.storeEmail ? escapeHtml(params.storeEmail) : '';
  const safeStoreAddress = params.storeAddress ? escapeHtml(params.storeAddress) : '';

  const currency = 'Rs.';

  const itemsHtml = params.items.map((item) => {
    const unitPrice = item.unitPrice || 0;
    const qty = item.qty || 1;
    const discount = item.discount || 0;
    const total = (unitPrice * qty) - discount;
    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: left; font-size: 14px; color: #18181b;">${escapeHtml(item.name || 'Item')}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: center; font-size: 14px; color: #52525b;">${qty}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-size: 14px; color: #52525b;">${currency} ${unitPrice.toLocaleString()}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-size: 14px; color: #52525b;">-${currency} ${discount.toLocaleString()}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-size: 14px; font-weight: 600; color: #18181b;">${currency} ${total.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  return sendEmail({
    to: params.to,
    subject: `Quotation #${params.quoteNumber} from ${safeStoreName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
            .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .brand { font-size: 22px; font-weight: 900; color: #09090b; letter-spacing: -0.5px; }
            .brand-sub { font-size: 13px; color: #71717a; margin-top: 4px; line-height: 1.4; }
            .doc-type { font-size: 20px; font-weight: 800; color: #d97706; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; }
            .doc-meta { font-size: 13px; color: #71717a; text-align: right; margin-top: 4px; font-family: monospace; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #a1a1aa; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #f4f4f5; padding-bottom: 6px; }
            .client-info { font-size: 14px; color: #18181b; line-height: 1.5; margin-bottom: 30px; }
            .client-name { font-weight: 700; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { padding: 10px 0; border-bottom: 2px solid #e4e4e7; color: #71717a; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .totals-table { width: 240px; float: right; border-collapse: collapse; margin-bottom: 30px; }
            .totals-table td { padding: 6px 0; font-size: 14px; color: #52525b; }
            .grand-row td { font-size: 16px; font-weight: 900; color: #09090b; padding-top: 12px; border-top: 2px solid #e4e4e7; }
            .notes-section { clear: both; background-color: #fafafa; border-radius: 8px; border: 1px solid #f4f4f5; padding: 16px; margin-top: 30px; }
            .notes-title { font-size: 12px; font-weight: 700; color: #71717a; margin-bottom: 6px; }
            .notes-text { font-size: 13px; color: #52525b; line-height: 1.5; }
            .footer { margin-top: 40px; font-size: 12px; color: #a1a1aa; text-align: center; border-top: 1px solid #f4f4f5; padding-top: 20px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <!-- Header Table -->
            <table class="header-table">
              <tr>
                <td style="vertical-align: top;">
                  <div class="brand">${safeStoreName}</div>
                  ${safeStoreAddress ? `<div class="brand-sub">${safeStoreAddress}</div>` : ''}
                  ${safeStorePhone ? `<div class="brand-sub">Tel: ${safeStorePhone}</div>` : ''}
                  ${safeStoreEmail ? `<div class="brand-sub">Email: ${safeStoreEmail}</div>` : ''}
                </td>
                <td style="vertical-align: top; text-align: right;">
                  <div class="doc-type">Quotation</div>
                  <div class="doc-meta">#${safeQuoteNumber}</div>
                  <div class="doc-meta" style="margin-top: 2px;">Valid Until: ${safeValidUntil}</div>
                </td>
              </tr>
            </table>

            <!-- Customer Details -->
            <div class="section-title">Billed To</div>
            <div class="client-info">
              <div class="client-name">${safeCustomerName}</div>
              ${safeCustomerCompany ? `<div>${safeCustomerCompany}</div>` : ''}
              ${safeCustomerPhone ? `<div style="font-family: monospace; font-size: 13px; margin-top: 2px;">${safeCustomerPhone}</div>` : ''}
              ${safeCustomerAddress ? `<div style="margin-top: 4px;">${safeCustomerAddress}</div>` : ''}
            </div>

            <!-- Items Table -->
            <div class="section-title">Quotation Details</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Item Description</th>
                  <th style="text-align: center; width: 60px;">Qty</th>
                  <th style="text-align: right; width: 100px;">Price</th>
                  <th style="text-align: right; width: 80px;">Disc</th>
                  <th style="text-align: right; width: 110px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Totals -->
            <table class="totals-table">
              <tr>
                <td>Subtotal</td>
                <td style="text-align: right; font-weight: 600;">${currency} ${params.subtotal.toLocaleString()}</td>
              </tr>
              ${params.discountAmount ? `
              <tr>
                <td>Discount</td>
                <td style="text-align: right; font-weight: 600; color: #dc2626;">-${currency} ${params.discountAmount.toLocaleString()}</td>
              </tr>` : ''}
              ${params.taxAmount ? `
              <tr>
                <td>Tax</td>
                <td style="text-align: right; font-weight: 600;">${currency} ${params.taxAmount.toLocaleString()}</td>
              </tr>` : ''}
              <tr class="grand-row">
                <td>Total</td>
                <td style="text-align: right;">${currency} ${params.totalAmount.toLocaleString()}</td>
              </tr>
            </table>

            <div style="clear: both;"></div>

            <!-- Notes -->
            ${safeNotes ? `
            <div class="notes-section">
              <div class="notes-title">Notes / Terms & Conditions</div>
              <div class="notes-text">${safeNotes}</div>
            </div>` : ''}

            <!-- Footer -->
            <div class="footer">
              <p>Thank you for your business. If you have any questions about this quotation, please contact us.</p>
              <p>© ${new Date().getFullYear()} ${safeStoreName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    devLog: () => {
      console.log('\n==================================================');
      console.log(`[DEV MAIL SENDER] Quotation Email sent for: ${params.to}`);
      console.log(`[DEV MAIL SENDER] Quote: #${params.quoteNumber} | Total: ${currency} ${params.totalAmount.toLocaleString()}`);
      console.log('==================================================\n');
    },
    devFallbackMessage: `Quotation #${params.quoteNumber} to ${params.to} for amount ${currency} ${params.totalAmount.toLocaleString()}`,
    prodErrorMessage: 'Failed to send quotation email.',
  });
}

interface SendOrderInvoiceEmailParams {
  to: string;
  orderNumber: string;
  customerName: string;
  shippingAddress: any;
  items: Array<{ name: string; qty: number; unitPrice: number; discount?: number }>;
  totalAmount: number;
  paymentMethod?: string;
  storeName?: string;
  storePhone?: string;
  storeEmail?: string;
  storeAddress?: string;
}

export async function sendOrderInvoiceEmail(params: SendOrderInvoiceEmailParams): Promise<{ success: boolean; error?: string }> {
  const safeTo = escapeHtml(params.to);
  const safeOrderNumber = escapeHtml(params.orderNumber);
  const safeCustomerName = escapeHtml(params.customerName);
  
  let formattedAddress = '';
  if (typeof params.shippingAddress === 'string') {
    formattedAddress = escapeHtml(params.shippingAddress);
  } else if (params.shippingAddress && typeof params.shippingAddress === 'object') {
    const addr = params.shippingAddress;
    const parts = [];
    if (addr.addressLine1) parts.push(addr.addressLine1);
    if (addr.addressLine2) parts.push(addr.addressLine2);
    if (addr.address) parts.push(addr.address);
    if (addr.city) parts.push(addr.city);
    if (addr.state) parts.push(addr.state);
    if (addr.postalCode) parts.push(addr.postalCode);
    if (addr.country) parts.push(addr.country);
    
    formattedAddress = parts.filter(Boolean).map(escapeHtml).join(', ');
  }

  const safeStoreName = escapeHtml(params.storeName || 'FTC Electronics');
  const safeStorePhone = params.storePhone ? escapeHtml(params.storePhone) : '';
  const safeStoreEmail = params.storeEmail ? escapeHtml(params.storeEmail) : '';
  const safeStoreAddress = params.storeAddress ? escapeHtml(params.storeAddress) : '';
  const safePaymentMethod = escapeHtml(params.paymentMethod || 'Paid');

  const currency = 'Rs.';

  const itemsHtml = params.items.map((item) => {
    const unitPrice = item.unitPrice || 0;
    const qty = item.qty || 1;
    const discount = item.discount || 0;
    const total = (unitPrice * qty) - discount;
    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: left; font-size: 14px; color: #18181b;">${escapeHtml(item.name || 'Item')}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: center; font-size: 14px; color: #52525b;">${qty}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-size: 14px; color: #52525b;">${currency} ${unitPrice.toLocaleString()}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-size: 14px; font-weight: 600; color: #18181b;">${currency} ${total.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  return sendEmail({
    to: params.to,
    subject: `Tax Invoice #${params.orderNumber} from ${safeStoreName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
            .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .brand { font-size: 22px; font-weight: 900; color: #09090b; letter-spacing: -0.5px; }
            .brand-sub { font-size: 13px; color: #71717a; margin-top: 4px; line-height: 1.4; }
            .doc-type { font-size: 20px; font-weight: 800; color: #16a34a; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; }
            .doc-meta { font-size: 13px; color: #71717a; text-align: right; margin-top: 4px; font-family: monospace; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #a1a1aa; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #f4f4f5; padding-bottom: 6px; }
            .client-info { font-size: 14px; color: #18181b; line-height: 1.5; margin-bottom: 30px; }
            .client-name { font-weight: 700; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { padding: 10px 0; border-bottom: 2px solid #e4e4e7; color: #71717a; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .totals-table { width: 240px; float: right; border-collapse: collapse; margin-bottom: 30px; }
            .totals-table td { padding: 6px 0; font-size: 14px; color: #52525b; }
            .grand-row td { font-size: 16px; font-weight: 900; color: #09090b; padding-top: 12px; border-top: 2px solid #e4e4e7; }
            .notes-section { clear: both; background-color: #fafafa; border-radius: 8px; border: 1px solid #f4f4f5; padding: 16px; margin-top: 30px; }
            .notes-title { font-size: 12px; font-weight: 700; color: #71717a; margin-bottom: 6px; }
            .notes-text { font-size: 13px; color: #52525b; line-height: 1.5; }
            .footer { margin-top: 40px; font-size: 12px; color: #a1a1aa; text-align: center; border-top: 1px solid #f4f4f5; padding-top: 20px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <!-- Header Table -->
            <table class="header-table">
              <tr>
                <td style="vertical-align: top;">
                  <div class="brand">${safeStoreName}</div>
                  ${safeStoreAddress ? `<div class="brand-sub">${safeStoreAddress}</div>` : ''}
                  ${safeStorePhone ? `<div class="brand-sub">Tel: ${safeStorePhone}</div>` : ''}
                  ${safeStoreEmail ? `<div class="brand-sub">Email: ${safeStoreEmail}</div>` : ''}
                </td>
                <td style="vertical-align: top; text-align: right;">
                  <div class="doc-type">Tax Invoice</div>
                  <div class="doc-meta">#${safeOrderNumber}</div>
                  <div class="doc-meta" style="margin-top: 2px;">Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </td>
              </tr>
            </table>

            <!-- Customer Details -->
            <div class="section-title">Billed To</div>
            <div class="client-info">
              <div class="client-name">${safeCustomerName}</div>
              ${formattedAddress ? `<div style="margin-top: 4px;">${formattedAddress}</div>` : ''}
            </div>

            <!-- Items Table -->
            <div class="section-title">Invoice Details</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Item Description</th>
                  <th style="text-align: center; width: 60px;">Qty</th>
                  <th style="text-align: right; width: 100px;">Price</th>
                  <th style="text-align: right; width: 110px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Totals -->
            <table class="totals-table">
              <tr class="grand-row">
                <td>Total Paid</td>
                <td style="text-align: right;">${currency} ${params.totalAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="font-size: 12px; color: #a1a1aa; padding-top: 6px;">Payment Method</td>
                <td style="text-align: right; font-size: 12px; color: #16a34a; font-weight: bold; padding-top: 6px;">${safePaymentMethod}</td>
              </tr>
            </table>

            <div style="clear: both;"></div>

            <!-- Footer -->
            <div class="footer">
              <p>This is an official payment receipt for your online purchase. Thank you for shopping with ${safeStoreName}!</p>
              <p>© ${new Date().getFullYear()} ${safeStoreName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    devLog: () => {
      console.log('\n==================================================');
      console.log(`[DEV MAIL SENDER] Order Invoice Email sent for: ${params.to}`);
      console.log(`[DEV MAIL SENDER] Order: #${params.orderNumber} | Total: ${currency} ${params.totalAmount.toLocaleString()}`);
      console.log('==================================================\n');
    },
    devFallbackMessage: `Order Invoice #${params.orderNumber} to ${params.to} for amount ${currency} ${params.totalAmount.toLocaleString()}`,
    prodErrorMessage: 'Failed to send order invoice email.',
  });
}
