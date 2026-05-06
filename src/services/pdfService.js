import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { marked } from 'marked';

/**
 * Browser-compatible PDF Generation Service
 * Replaces Puppeteer for WebContainer compatibility
 */
export async function exportToPdf(markdown, filename = 'research-report.pdf') {
  // Create a hidden container for rendering the PDF content
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.color = '#1a1a1a';
  container.style.fontFamily = 'Inter, system-ui, sans-serif';
  container.style.lineHeight = '1.6';

  // Basic styling for the PDF content
  const htmlContent = `
    <style>
      h1 { font-size: 28pt; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px; }
      h2 { font-size: 20pt; color: #111827; margin-top: 30px; border-left: 5px solid #3b82f6; padding-left: 15px; }
      h3 { font-size: 16pt; color: #374151; margin-top: 20px; }
      p { margin-bottom: 15px; font-size: 11pt; text-align: justify; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt; }
      th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
      th { background-color: #f9fafb; font-weight: bold; }
      ul { margin-bottom: 15px; padding-left: 20px; }
      li { margin-bottom: 5px; font-size: 11pt; }
      .source-index { font-size: 9pt; color: #6b7280; }
    </style>
    <div class="pdf-content">
      ${marked.parse(markdown)}
    </div>
  `;

  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    // Handle multi-page if necessary
    let heightLeft = pdfHeight;
    let position = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
    return true;
  } catch (error) {
    console.error('PDF Export failed:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}