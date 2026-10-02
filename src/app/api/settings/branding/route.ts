import { NextResponse } from 'next/server';
import { sbSiteSettings } from '@/lib/supabase-collections';

function parseSettingValue(setting: { value?: unknown } | null | undefined): unknown {
  if (!setting || setting.value === undefined || setting.value === null) {
    return null;
  }
  if (typeof setting.value !== 'string') {
    return setting.value;
  }
  const trimmed = setting.value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function GET() {
  try {
    const [genSetting, persSetting] = await Promise.all([
      sbSiteSettings.getByKey('general').catch(() => null),
      sbSiteSettings.getByKey('personalization').catch(() => null),
    ]);

    const genSettings = parseSettingValue(genSetting);
    const persSettings = parseSettingValue(persSetting);

    return NextResponse.json({
      general: genSettings,
      personalization: persSettings,
    });
  } catch (error) {
    console.error('Branding API error:', error);
    return NextResponse.json(
      { error: 'Failed to load branding settings' },
      { status: 500 }
    );
  }
}
