'use strict';

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const STATUS_LABELS = {
  draft: 'Brouillon',
  registered: 'Enregistré',
  analyzed: 'Analysé',
  pending_visa: 'En attente de visa',
  visa_approved: 'Visé',
  visa_rejected: 'Rejeté',
  assigned: 'Assigné',
  in_progress: 'En traitement',
  processed: 'Traité',
  archived: 'Archivé',
  cancelled: 'Annulé',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function buildMailPdf(record) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('FICHE DE COURRIER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Référence : ${record.reference}`);
    doc.text(`Type : ${record.type}`);
    doc.text(`Statut : ${STATUS_LABELS[record.status] || record.status}`);
    doc.text(`Priorité : ${record.priority}`);
    doc.text(`Confidentialité : ${record.confidentiality}`);
    doc.moveDown();
    doc.text(`Ministère : ${record.ministry_name || '—'}`);
    doc.text(`Service : ${record.service_name || '—'}`);
    doc.text(`Nature : ${record.nature_name || '—'}`);
    doc.text(`Date de réception : ${formatDate(record.received_at)}`);
    doc.text(`Date de dépôt : ${formatDate(record.deposited_at)}`);
    doc.text(`Échéance : ${formatDate(record.due_at)}`);
    doc.text(`Décision : ${formatDate(record.decided_at)}`);
    doc.moveDown();
    doc.fontSize(13).text('Objet / analyse', { underline: true });
    doc.fontSize(11).text(record.subject || record.analysis || '—');
    doc.moveDown();
    doc.fontSize(13).text('Bordereau', { underline: true });
    doc.fontSize(11).text(record.bordereau || '—');
    doc.moveDown();
    doc.fontSize(13).text('Observation', { underline: true });
    doc.fontSize(11).text(record.observation || '—');
    doc.moveDown();
    doc.fontSize(13).text('Projet visé', { underline: true });
    doc.fontSize(11).text(record.projet_vise || '—');
    doc.moveDown();
    doc.fontSize(13).text('Historique', { underline: true });
    doc.fontSize(10);
    for (const event of record.events || []) {
      doc.text(
        `${formatDate(event.created_at)} — ${event.event_type} — ${
          event.actor_name || 'Système'
        }${event.comment ? ` — ${event.comment}` : ''}`
      );
    }
    doc.moveDown();
    doc.fontSize(8).fillColor('#666').text(
      `Document généré le ${new Date().toLocaleString('fr-FR')}`,
      { align: 'center' }
    );
    doc.end();
  });
}

function buildXlsx(rows, columns, sheetName = 'Courriers') {
  return new Promise((resolve, reject) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mail Management';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 22,
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    for (const row of rows) {
      sheet.addRow(columns.reduce((acc, column) => {
        acc[column.key] = row[column.key];
        return acc;
      }, {}));
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
    workbook.xlsx
      .writeBuffer()
      .then((buffer) => resolve(buffer))
      .catch(reject);
  });
}

function buildCsv(rows, columns) {
  const escape = (value) => {
    if (value == null) return '';
    const text = String(value).replace(/"/g, '""');
    return /[",\n;]/.test(text) ? `"${text}"` : text;
  };
  const header = columns.map((column) => escape(column.header)).join(';');
  const lines = rows.map((row) =>
    columns.map((column) => escape(row[column.key])).join(';')
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}

module.exports = { buildMailPdf, buildXlsx, buildCsv, STATUS_LABELS };
