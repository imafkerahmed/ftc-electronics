'use server';

import { writeAuditLog } from '@/lib/pb-admin';
import { pbContactInquiries } from '@/lib/pb-collections';
import type { InquiryStatus, PBContactInquiry } from '@/types/admin';

export interface ContactFormInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

export async function submitContactFormAction(data: ContactFormInput): Promise<{ success: boolean; error?: string }> {
  try {
    const { name, email, phone, message } = data;

    if (!name || !email || !message) {
      return { success: false, error: 'Please fill in all required fields.' };
    }

    // Save inquiry to PocketBase database collection for Admin Panel view & management
    try {
      await pbContactInquiries.create({
        name,
        email,
        phone: phone || '',
        message,
        status: 'new',
        read: false,
      });
    } catch (dbErr) {
      // Fallback audit log recording if collection is initializing
      await writeAuditLog(
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
      ).catch(() => null);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[CONTACT FORM ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to submit message. Please try again.' };
  }
}

// ─── Admin Panel Inquiry Actions ──────────────────────────────────────────────

export async function getInquiriesAction(): Promise<{ success: boolean; inquiries?: PBContactInquiry[]; error?: string }> {
  try {
    const inquiries = await pbContactInquiries.getAll();
    return { success: true, inquiries: inquiries || [] };
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
  try {
    const updated = await pbContactInquiries.update(id, {
      status,
      notes: notes !== undefined ? notes : undefined,
      read: true,
    });
    return { success: true, inquiry: updated };
  } catch (error: any) {
    console.error('[UPDATE INQUIRY ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to update inquiry' };
  }
}

export async function deleteInquiryAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const deleted = await pbContactInquiries.delete(id);
    return { success: deleted };
  } catch (error: any) {
    console.error('[DELETE INQUIRY ACTION ERROR]', error);
    return { success: false, error: error?.message || 'Failed to delete inquiry' };
  }
}
