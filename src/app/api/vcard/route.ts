import { NextResponse } from 'next/server';
import { pbSiteSettings } from '@/lib/pb-collections';

export async function GET() {
  try {
    const settings = await pbSiteSettings.get<any>('general');
    
    const siteName = settings?.siteName || 'FTC Electronics';
    const phone = settings?.contactInfo?.phone || '+94 77 123 4567';
    const email = settings?.contactInfo?.email || 'info@ftc.lk';
    const website = process.env.NEXT_PUBLIC_SITE_URL || 'https://ftc.lk';
    const address = settings?.location?.address || 'Colombo, Sri Lanka';
    const city = settings?.location?.city || 'Colombo';

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${siteName}`,
      `ORG:${siteName}`,
      `TEL;TYPE=WORK,VOICE:${phone}`,
      `TEL;TYPE=CELL,VOICE:${settings?.contactInfo?.whatsapp || phone}`,
      `EMAIL;TYPE=WORK:${email}`,
      `URL:${website}`,
      `ADR;TYPE=WORK:;;${address};${city};;;Sri Lanka`,
      'TITLE:Premium Electronics & Authorized Reseller',
      'NOTE:Scan & Connect with FTC Electronics. Direct hotline & WhatsApp support.',
      'END:VCARD',
    ].join('\r\n');

    return new NextResponse(vcard, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': 'attachment; filename="FTC_Electronics.vcf"',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    const defaultVcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:FTC Electronics',
      'ORG:FTC Electronics',
      'TEL;TYPE=WORK,VOICE:+94771234567',
      'EMAIL;TYPE=WORK:info@ftc.lk',
      'URL:https://ftc.lk',
      'END:VCARD',
    ].join('\r\n');

    return new NextResponse(defaultVcard, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': 'attachment; filename="FTC_Electronics.vcf"',
      },
    });
  }
}
