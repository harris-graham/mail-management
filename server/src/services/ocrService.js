'use strict';

const fs = require('fs/promises');
const { query } = require('../db/pool');
const logger = require('../lib/logger');

async function extractPdfText(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractImageText(filePath) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('fra');
  try {
    const result = await worker.recognize(filePath);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function processAttachment(attachmentId, filePath, mimeType) {
  try {
    let text = '';
    if (mimeType === 'application/pdf') {
      text = await extractPdfText(filePath);
    } else if (mimeType.startsWith('image/')) {
      text = await extractImageText(filePath);
    } else {
      await query(
        "UPDATE attachments SET ocr_status = 'skipped' WHERE id = $1",
        [attachmentId]
      );
      return;
    }

    await query(
      `UPDATE attachments SET ocr_text = $1, ocr_status = 'done' WHERE id = $2`,
      [text.slice(0, 200_000), attachmentId]
    );
  } catch (error) {
    logger.warn({ err: error, attachmentId }, 'OCR extraction failed');
    await query(
      "UPDATE attachments SET ocr_status = 'failed' WHERE id = $1",
      [attachmentId]
    ).catch(() => {});
  }
}

module.exports = { processAttachment, extractPdfText, extractImageText };
