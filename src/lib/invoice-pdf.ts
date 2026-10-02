import PDFDocument from 'pdfkit';
import type { InvoiceDocumentData } from '@/types/invoice-document';

/**
 * High-performance, server-side vector PDF generator for FTC Electronics invoices.
 * Produces a clean, single-page A4 layout for normal 1–5 item invoices, and
 * creates multi-page layouts only when content genuinely requires it.
 */
export async function generateInvoicePdfBuffer(data: InvoiceDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const pageWidth = 595.28;  // A4 width in pt
      const pageHeight = 841.89; // A4 height in pt
      const margin = 32;         // 32 pt (~11.3 mm) margins
      const contentWidth = pageWidth - margin * 2;
      const maxContentY = pageHeight - 38; // Reserve bottom area for page numbering footer

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: margin, bottom: 25, left: margin, right: margin },
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // Primary Brand Colors
      const primaryColor = '#0f172a'; // Deep slate / navy
      const accentColor = '#2563eb';  // Royal blue
      const paidColor = '#16a34a';    // Emerald green
      const mutedColor = '#64748b';   // Slate grey
      const borderColor = '#e2e8f0'; // Light grey border

      // ─── Header Rendering ────────────────────────────────────────────────────────
      const drawFullHeader = () => {
        // Business Info (Left Header)
        doc.font('Helvetica-Bold').fontSize(15).fillColor(primaryColor);
        doc.text(data.business.storeName || 'FTC ELECTRONICS', margin, margin);

        doc.font('Helvetica').fontSize(8).fillColor(mutedColor);
        let currentY = margin + 17;
        if (data.business.address) {
          doc.text(data.business.address, margin, currentY, { width: 230 });
          currentY += doc.heightOfString(data.business.address, { width: 230 }) + 1;
        }
        const contactParts = [
          data.business.phone ? `Tel: ${data.business.phone}` : null,
          data.business.email ? `Email: ${data.business.email}` : null,
          data.business.website ? `Web: ${data.business.website}` : null,
        ].filter(Boolean);

        if (contactParts.length > 0) {
          doc.text(contactParts.join('  |  '), margin, currentY, { width: 280 });
          currentY += 10;
        }
        if (data.business.taxNumber) {
          doc.text(data.business.taxNumber, margin, currentY, { width: 280 });
          currentY += 10;
        }

        // Document Meta (Right Header)
        const rightX = 340;
        const rightWidth = contentWidth - (rightX - margin);
        doc.font('Helvetica-Bold').fontSize(20).fillColor(accentColor);
        doc.text('INVOICE', rightX, margin, { width: rightWidth, align: 'right' });

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor);
        doc.text(`Invoice #: ${data.invoiceNumber}`, rightX, margin + 23, { width: rightWidth, align: 'right' });

        doc.font('Helvetica').fontSize(8).fillColor(mutedColor);
        doc.text(`Invoice Date: ${data.invoiceDate}`, rightX, margin + 35, { width: rightWidth, align: 'right' });
        doc.text(`Order Ref: #${data.orderNumber}`, rightX, margin + 46, { width: rightWidth, align: 'right' });
        doc.text(`Order Date: ${data.orderDate}`, rightX, margin + 57, { width: rightWidth, align: 'right' });

        // Status Badge (PAID / UNPAID)
        const isPaid = data.paymentStatus === 'PAID';
        const badgeY = margin + 70;
        const badgeWidth = 85;
        const badgeHeight = 16;
        const badgeX = pageWidth - margin - badgeWidth;

        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 3)
          .fillAndStroke(isPaid ? '#f0fdf4' : '#fffbeb', isPaid ? paidColor : '#d97706');

        doc.font('Helvetica-Bold').fontSize(8).fillColor(isPaid ? paidColor : '#d97706');
        doc.text(isPaid ? 'STATUS: PAID' : 'STATUS: UNPAID', badgeX, badgeY + 4, { width: badgeWidth, align: 'center' });

        return Math.max(currentY, badgeY + badgeHeight) + 8;
      };

      // Compact Header for Subsequent Pages (Page 2+)
      const drawContinuedHeader = (pageNumber: number) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor);
        doc.text(data.business.storeName || 'FTC ELECTRONICS', margin, margin);
        
        doc.font('Helvetica').fontSize(8).fillColor(mutedColor);
        doc.text(`INVOICE #${data.invoiceNumber}  |  Order #${data.orderNumber}  (Continued - Page ${pageNumber})`, margin + 140, margin + 1, { width: contentWidth - 140, align: 'right' });

        const divY = margin + 14;
        doc.strokeColor(borderColor).lineWidth(0.5).moveTo(margin, divY).lineTo(pageWidth - margin, divY).stroke();
        return divY + 6;
      };

      // ─── Table Header ────────────────────────────────────────────────────────────
      const drawTableHeader = (posY: number) => {
        const headerHeight = 17;
        doc.rect(margin, posY, contentWidth, headerHeight).fillColor('#f8fafc').fill();
        doc.strokeColor(borderColor).lineWidth(1).moveTo(margin, posY + headerHeight).lineTo(pageWidth - margin, posY + headerHeight).stroke();

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(mutedColor);
        doc.text('#', margin + 6, posY + 5, { width: 18 });
        doc.text('ITEM DESCRIPTION', margin + 28, posY + 5, { width: 250 });
        doc.text('QTY', margin + 285, posY + 5, { width: 35, align: 'center' });
        doc.text('UNIT PRICE', margin + 325, posY + 5, { width: 70, align: 'right' });
        doc.text('DISC', margin + 400, posY + 5, { width: 45, align: 'right' });
        doc.text('TOTAL', margin + 450, posY + 5, { width: contentWidth - 450, align: 'right' });

        return posY + headerHeight + 2;
      };

      // ─── Page 1 Build ────────────────────────────────────────────────────────────
      let y = drawFullHeader();

      // Divider Line
      doc.strokeColor(borderColor).lineWidth(0.75).moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
      y += 8;

      // Customer & Shipping 2-Column Block
      const colGap = 16;
      const colWidth = (contentWidth - colGap) / 2;

      // Billed To Column
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(mutedColor);
      doc.text('BILLED TO', margin, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryColor);
      doc.text(data.customerName || 'Customer', margin, y + 10);

      doc.font('Helvetica').fontSize(8).fillColor(mutedColor);
      let billY = y + 21;
      if (data.customerCompany) {
        doc.text(data.customerCompany, margin, billY, { width: colWidth });
        billY += 10;
      }
      const customerContacts = [data.customerPhone, data.customerEmail].filter(Boolean).join('  |  ');
      if (customerContacts) {
        doc.text(customerContacts, margin, billY, { width: colWidth });
        billY += 10;
      }
      if (data.customerAddress) {
        const addrHeight = doc.heightOfString(data.customerAddress, { width: colWidth });
        doc.text(data.customerAddress, margin, billY, { width: colWidth });
        billY += addrHeight + 2;
      }

      // Shipped To Column
      const shipX = margin + colWidth + colGap;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(mutedColor);
      doc.text('SHIPPED TO', shipX, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryColor);
      doc.text(data.customerName || 'Customer', shipX, y + 10);

      doc.font('Helvetica').fontSize(8).fillColor(mutedColor);
      let shipY = y + 21;
      if (data.shippingAddress) {
        const shipAddrHeight = doc.heightOfString(data.shippingAddress, { width: colWidth });
        doc.text(data.shippingAddress, shipX, shipY, { width: colWidth });
        shipY += shipAddrHeight + 2;
      } else {
        doc.text('Store Pickup / Direct Delivery', shipX, shipY, { width: colWidth });
        shipY += 10;
      }

      y = Math.max(billY, shipY) + 8;

      // Draw initial table header
      y = drawTableHeader(y);

      // ─── Estimate Footer Block Heights for Smart Page Breaking ───────────────────
      const currency = data.currency || 'Rs.';
      
      // Calculate payment & totals height
      const paymentBoxLines = 2 + (data.paidAt ? 1 : 0) + (data.paymentReference ? 1 : 0);
      const paymentBoxHeight = Math.max(50, 18 + paymentBoxLines * 10);
      const totalsRowsCount = 2 + (data.discount > 0 ? 1 : 0) + (data.shipping > 0 ? 1 : 0) + (data.tax > 0 ? 1 : 0);
      const totalsBoxHeight = totalsRowsCount * 12 + 16;
      const summarySectionHeight = Math.max(paymentBoxHeight, totalsBoxHeight) + 8;

      // Warranty statement height
      let warrantyHeight = 0;
      if (data.warrantyStatement) {
        const stmtTextHeight = doc.heightOfString(data.warrantyStatement, { width: contentWidth - 18 });
        warrantyHeight = 16 + stmtTextHeight + 8;
      }

      // Terms & conditions height
      let termsHeight = 0;
      if (data.termsAndConditions) {
        const termsTextHeight = doc.heightOfString(data.termsAndConditions, { width: contentWidth });
        termsHeight = 14 + termsTextHeight + 6;
      }

      const totalTrailingBlockHeight = summarySectionHeight + warrantyHeight + termsHeight + 12;

      // ─── Render Items ────────────────────────────────────────────────────────────
      let currentPageNum = 1;

      data.items.forEach((item, index) => {
        const serialsList = Array.isArray(item.serials) && item.serials.length > 0
          ? item.serials.filter(Boolean)
          : Array.isArray(item.serialNumbers)
            ? item.serialNumbers.filter(Boolean)
            : [];
        
        const descWidth = 250;
        const itemTitle = item.sku ? `${item.name || 'Product'} [${item.sku}]` : item.name || 'Product';
        
        doc.font('Helvetica-Bold').fontSize(8);
        const nameHeight = doc.heightOfString(itemTitle, { width: descWidth });
        const hasSerials = serialsList.length > 0;
        const rowHeight = Math.max(16, nameHeight + (hasSerials ? 11 : 0) + 5);

        const isLastItem = index === data.items.length - 1;

        // Check page overflow
        if (isLastItem) {
          // For the last item, check if both item and trailing blocks fit on this page
          if (y + rowHeight > maxContentY) {
            // Item itself doesn't fit
            doc.addPage();
            currentPageNum++;
            y = drawContinuedHeader(currentPageNum);
            y = drawTableHeader(y);
          }
        } else {
          // For non-last items, only break if item itself overflows
          if (y + rowHeight > maxContentY) {
            doc.addPage();
            currentPageNum++;
            y = drawContinuedHeader(currentPageNum);
            y = drawTableHeader(y);
          }
        }

        // Render Item Index
        doc.font('Helvetica').fontSize(7.5).fillColor(mutedColor);
        doc.text(String(index + 1).padStart(2, '0'), margin + 6, y + 2, { width: 18 });

        // Render Product Name
        doc.font('Helvetica-Bold').fontSize(8).fillColor(primaryColor);
        doc.text(itemTitle, margin + 28, y + 2, { width: descWidth });

        // Render Serial Numbers (if available)
        if (hasSerials) {
          doc.font('Helvetica').fontSize(6.8).fillColor(accentColor);
          doc.text(`S/N: ${serialsList.join(', ')}`, margin + 28, y + 2 + nameHeight + 1, { width: descWidth });
        }

        // Render Qty, Unit Price, Disc, Total
        doc.font('Helvetica').fontSize(8).fillColor(primaryColor);
        doc.text(String(item.qty || 1), margin + 285, y + 2, { width: 35, align: 'center' });
        doc.text(`${currency} ${(item.unitPrice || 0).toLocaleString('en-LK')}`, margin + 325, y + 2, { width: 70, align: 'right' });

        const discountVal = item.discount || 0;
        doc.text(discountVal > 0 ? `-${currency} ${discountVal.toLocaleString('en-LK')}` : '—', margin + 400, y + 2, { width: 45, align: 'right' });

        const lineTotal = item.lineTotal || (item.unitPrice * item.qty - discountVal);
        doc.font('Helvetica-Bold').text(`${currency} ${lineTotal.toLocaleString('en-LK')}`, margin + 450, y + 2, { width: contentWidth - 450, align: 'right' });

        y += rowHeight;
        doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
        y += 2;
      });

      y += 6;

      // ─── Summary & Payment Details Block ─────────────────────────────────────────
      // If the summary block cannot fit in the remaining space, create a clean new page
      if (y + totalTrailingBlockHeight > maxContentY) {
        doc.addPage();
        currentPageNum++;
        y = drawContinuedHeader(currentPageNum);
      }

      const summaryY = y;
      const paymentBoxWidth = 240;
      const totalsBoxWidth = 220;
      const totalsBoxX = pageWidth - margin - totalsBoxWidth;

      // Payment Info Box (Left)
      doc.roundedRect(margin, summaryY, paymentBoxWidth, paymentBoxHeight, 3)
        .fillAndStroke('#f8fafc', borderColor);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(mutedColor);
      doc.text('PAYMENT INFORMATION', margin + 10, summaryY + 7);

      doc.font('Helvetica').fontSize(7.5).fillColor(primaryColor);
      let pY = summaryY + 18;
      doc.text(`Payment Method: ${data.paymentMethod || 'Bank Transfer'}`, margin + 10, pY);
      pY += 9.5;
      doc.text(`Payment Status: ${data.paymentStatus}`, margin + 10, pY);
      pY += 9.5;
      if (data.paidAt) {
        doc.text(`Payment Date: ${data.paidAt}`, margin + 10, pY);
        pY += 9.5;
      }
      if (data.paymentReference) {
        doc.text(`Reference: ${data.paymentReference}`, margin + 10, pY, { width: paymentBoxWidth - 20, ellipsis: true });
      }

      // Totals Table (Right)
      let totY = summaryY;
      const addTotalRow = (label: string, value: string, isGrand: boolean = false, isDisc: boolean = false) => {
        doc.font(isGrand ? 'Helvetica-Bold' : 'Helvetica').fontSize(isGrand ? 9.5 : 8)
          .fillColor(isGrand ? accentColor : (isDisc ? '#dc2626' : mutedColor));
        doc.text(label, totalsBoxX, totY, { width: 95 });
        doc.text(value, totalsBoxX + 95, totY, { width: totalsBoxWidth - 95, align: 'right' });
        totY += isGrand ? 13 : 11;
      };

      addTotalRow('Subtotal', `${currency} ${data.subtotal.toLocaleString('en-LK')}`);
      if (data.discount > 0) {
        addTotalRow('Discount', `-${currency} ${data.discount.toLocaleString('en-LK')}`, false, true);
      }
      if (data.shipping > 0) {
        addTotalRow('Shipping', `${currency} ${data.shipping.toLocaleString('en-LK')}`);
      }
      if (data.tax > 0) {
        addTotalRow('Tax', `${currency} ${data.tax.toLocaleString('en-LK')}`);
      }

      doc.strokeColor(borderColor).lineWidth(0.75).moveTo(totalsBoxX, totY).lineTo(totalsBoxX + totalsBoxWidth, totY).stroke();
      totY += 4;
      addTotalRow('Grand Total', `${currency} ${data.total.toLocaleString('en-LK')}`, true);

      y = Math.max(summaryY + paymentBoxHeight, totY) + 8;

      // ─── Warranty Statement Block ────────────────────────────────────────────────
      if (data.warrantyStatement) {
        const stmtTextHeight = doc.heightOfString(data.warrantyStatement, { width: contentWidth - 18 });
        const boxH = stmtTextHeight + 18;

        if (y + boxH > maxContentY) {
          doc.addPage();
          currentPageNum++;
          y = drawContinuedHeader(currentPageNum);
        }

        doc.roundedRect(margin, y, contentWidth, boxH, 3)
          .fillAndStroke('#eff6ff', '#bfdbfe');

        doc.font('Helvetica-Bold').fontSize(7.2).fillColor(accentColor);
        doc.text('OFFICIAL WARRANTY & PROOF OF PURCHASE', margin + 9, y + 6);
        doc.font('Helvetica').fontSize(7.2).fillColor('#1e40af');
        doc.text(data.warrantyStatement, margin + 9, y + 16, { width: contentWidth - 18 });
        y += boxH + 6;
      }

      // ─── Terms & Conditions Block ────────────────────────────────────────────────
      if (data.termsAndConditions) {
        const termsTextHeight = doc.heightOfString(data.termsAndConditions, { width: contentWidth });
        const blockH = termsTextHeight + 14;

        if (y + blockH > maxContentY) {
          doc.addPage();
          currentPageNum++;
          y = drawContinuedHeader(currentPageNum);
        }

        doc.font('Helvetica-Bold').fontSize(7.2).fillColor(mutedColor);
        doc.text('TERMS & CONDITIONS', margin, y);
        doc.font('Helvetica').fontSize(6.8).fillColor(mutedColor);
        doc.text(data.termsAndConditions, margin, y + 9, { width: contentWidth });
        y += blockH + 4;
      }

      // ─── Global Footer & Page Numbering Across All Pages ─────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        // CRITICAL: set margins.bottom to 0 so PDFKit's line wrapper never triggers an auto-page
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(7.2).fillColor(mutedColor);
        doc.text(
          `Page ${i + 1} of ${range.count} — Thank you for choosing FTC Electronics.`,
          margin,
          pageHeight - 20,
          { width: contentWidth, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export const generateInvoicePdf = generateInvoicePdfBuffer;


