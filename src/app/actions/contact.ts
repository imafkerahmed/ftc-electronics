'use server';

import { writeAuditLog } from '@/lib/supabase-admin';
import { pbContactInquiries } from '@/lib/supabase-collections';
import { checkPermission } from '@/app/actions/admin';
import type { InquiryStatus, PBContactInquiry } from '@/types/admin';

export interface ContactFormInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

export async function submitContactFormAction(data: ContactFormInput): Promise<{ success: boolean; error?: string }> {
  try {
    const name = (data.name || '').trim();
    const email = (data.email || '').trim();
    const phone = (data.phone || '').trim();
    const message = (data.message || '').trim();

    if (!name || !email || !message) {
      return { success: false, error: 'Please fill in all required fields.' };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (name.length > 120 || email.length > 254 || phone.length > 40 || message.length > 5000) {
      return { success: false, error: 'One or more fields exceed the maximum allowed length.' };
    }

    try {
      await pbContactInquiries.create({
        name,
        email,
        phone: phone || '',
        message,
      });
    } catch (dbErr) {
      console.error('[CONTACT FORM] Failed to persist inquiry:', dbErr);

      const logged = await writeAuditLog(
        'system',
        'create',
        'contact_inquiry',
        '',
        undefined,
        {
          name,
          email,
          phone: phone || 'N/A',
          messageSnippet: message.slice(0, 200),
        }
      )
        .then(() => true)
        .catch(() => false);

      if (!logged) {
        return { success: false, error: 'Failed to submit message. Please try again.' };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[CONTACT FORM ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to submit message. Please try again.' };
  }
}

export async function getInquiriesAction(): Promise<{ success: boolean; inquiries?: PBContactInquiry[]; error?: string }> {
  const check = await checkPermission('inquiries', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const inquiries = await pbContactInquiries.getAll();
    return { success: true, inquiries };
  } catch (error: any) {
    console.error('[GET INQUIRIES ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to fetch inquiries' };
  }
}

export async function updateInquiryStatusAction(
  id: string,
  status: InquiryStatus,
  notes?: string
): Promise<{ success: boolean; inquiry?: PBContactInquiry; error?: string }> {
  const check = await checkPermission('inquiries', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const patch: Record<string, unknown> = { status };
    if (notes !== undefined) {
      patch.admin_notes = notes;
    }
    const inquiry = await pbContactInquiries.update(id, patch);
    return { success: true, inquiry };
  } catch (error: any) {
    console.error('[UPDATE INQUIRY ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to update inquiry' };
  }
}

export async function deleteInquiryAction(id: string): Promise<{ success: boolean; error?: string }> {
  const check = await checkPermission('inquiries', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    await pbContactInquiries.delete(id);
    return { success: true };
  } catch (error: any) {
    console.error('[DELETE INQUIRY ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to delete inquiry' };
  }
}
