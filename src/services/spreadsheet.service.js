import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import readExcelFile from 'read-excel-file/node';

import { AppError } from '../middleware/error-handler.js';

const SUPPORTED_EXTENSIONS = new Set(['.csv', '.xlsx']);
const MAX_RETURNED_ERRORS = 100;

export class ValidationCollector {
  constructor() {
    this.errors = [];
    this.totalErrors = 0;
  }

  add({ row, column, code, message }) {
    this.totalErrors += 1;

    if (this.errors.length < MAX_RETURNED_ERRORS) {
      this.errors.push({ row, column, code, message });
    }
  }

  throwIfAny() {
    if (this.totalErrors > 0) {
      throw new AppError(400, 'IMPORT_VALIDATION_FAILED', 'The uploaded file contains validation errors.', {
        errors: this.errors,
        totalErrors: this.totalErrors,
        errorsTruncated: this.totalErrors > this.errors.length
      });
    }
  }
}

export function valueAt(row, index) {
  if (index === undefined || row[index] === null || row[index] === undefined) {
    return '';
  }

  return String(row[index]).trim();
}

export function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeUpper(value) {
  return value.trim().toUpperCase();
}

export function findHeaderIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

export async function readSpreadsheet(file) {
  if (!file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Attach one CSV or XLSX file using the field name file.');
  }

  const extension = path.extname(file.originalname).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'Only .csv and .xlsx files are supported.');
  }

  let rows;

  try {
    if (extension === '.csv') {
      rows = parseCsv(file.buffer.toString('utf8'), {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false
      });
    } else {
      const sheets = await readExcelFile(file.buffer);
      const firstNonEmptySheet = sheets.find((sheet) =>
        sheet.data.some((row) => row.some((value) => String(value ?? '').trim() !== ''))
      );
      rows = firstNonEmptySheet?.data ?? [];
    }
  } catch {
    throw new AppError(400, 'INVALID_SPREADSHEET', 'The uploaded file could not be read as a CSV or XLSX spreadsheet.');
  }

  const firstContentRow = rows.findIndex((row) => row.some((value) => String(value ?? '').trim() !== ''));

  if (firstContentRow === -1) {
    throw new AppError(400, 'EMPTY_FILE', 'The uploaded spreadsheet is empty.');
  }
  const headers = rows[firstContentRow].map((value) => valueAt([value], 0));

  if (headers.length === 0 || headers.every((header) => header === '')) {
    throw new AppError(400, 'MISSING_HEADERS', 'The uploaded spreadsheet must contain a header row.');
  }

  return {
    headers,
    rows: rows.slice(firstContentRow + 1),
    firstDataRowNumber: firstContentRow + 2
  };
}
