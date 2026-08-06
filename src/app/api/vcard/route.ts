import { NextResponse } from 'next/server';
import { pbSiteSettings } from '@/lib/pb-collections';

function escapeVCardValue(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export async function GET() {
  try {
    const settings = await pbSiteSettings.get<any>('general');
    
    const siteName = settings?.siteName || 'FTC Electronics';
    const phone = settings?.contactInfo?.phone || '+94 77 123 4567';
    const email = settings?.contactInfo?.email || 'info@ftc.lk';
    const website = process.env.NEXT_PUBLIC_SITE_URL || 'https://ftc.lk';
    const address = settings?.location?.address || 'Colombo, Sri Lanka';
    const city = settings?.location?.city || 'Colombo';
    const tagline = settings?.tagline || 'Premium Electronics & Authorized Reseller';

    const safeFileName = `${siteName.replace(/[^a-zA-Z0-9_-]/g, '_')}.vcf`;

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCardValue(siteName)}`,
      `ORG:${escapeVCardValue(siteName)}`,
      `TEL;TYPE=WORK,VOICE:${escapeVCardValue(phone)}`,
      `TEL;TYPE=CELL,VOICE:${escapeVCardValue(settings?.contactInfo?.whatsapp || phone)}`,
      `EMAIL;TYPE=WORK:${escapeVCardValue(email)}`,
      `URL:${escapeVCardValue(website)}`,
      `ADR;TYPE=WORK:;;${escapeVCardValue(address)};${escapeVCardValue(city)};;;Sri Lanka`,
      `TITLE:${escapeVCardValue(tagline)}`,
      `NOTE:${escapeVCardValue(`Scan & Connect with ${siteName}. Direct hotline & WhatsApp support.`)}`,
      'END:VCARD',
    ].join('\r\n');

    return new NextResponse(vcard, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    const siteName = 'FTC Electronics';
    const safeFileName = `${siteName.replace(/[^a-zA-Z0-9_-]/g, '_')}.vcf`;
    const defaultVcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCardValue(siteName)}`,
      `ORG:${escapeVCardValue(siteName)}`,
      'TEL;TYPE=WORK,VOICE:+94771234567',
      'EMAIL;TYPE=WORK:info@ftc.lk',
      'URL:https://ftc.lk',
      'END:VCARD',
    ].join('\r\n');

    return new NextResponse(defaultVcard, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
      },
    });
  }
}
