'use strict';
/**
 * Excel (.xlsx) bilan ishlash.
 *  - parseRows():  2 o'lchamli massivni savollarga aylantiradi va tekshiradi (sof funksiya, testlanadi)
 *  - readQuestions(): buffer -> parseRows (SheetJS orqali)
 *  - buildTemplate(): yuklab olish uchun namuna fayl
 *  - buildResultsWorkbook(): natijalarni eksport qilish
 */
const { LETTERS, cleanText, cleanMultiline } = require('./util');

const MAX_ROWS = 1000;

function norm(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES = {
  question: ['question', 'savol', 'q'],
  A: ['a', 'optiona', 'varianta'],
  B: ['b', 'optionb', 'variantb'],
  C: ['c', 'optionc', 'variantc'],
  D: ['d', 'optiond', 'variantd'],
  correct: ['correctanswer', 'correct', 'answer', 'togrijavob', 'togrijavobi', 'javob'],
};

function mapHeader(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const n = norm(cell);
    if (!n) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key] === undefined && aliases.includes(n)) map[key] = idx;
    }
  });
  const ok = ['question', 'A', 'B', 'C', 'D', 'correct'].every((k) => map[k] !== undefined);
  return { map, ok, hasQuestion: map.question !== undefined };
}

/**
 * @param {any[][]} rows  varaq qatorlari (0-indeks = Excel 1-qator)
 * @returns {{items: object[], questions: object[], errors: object[], found: number, fatal?: string}}
 */
function parseRows(rows) {
  // sarlavha qatorini birinchi 5 qator ichidan qidirish
  let headerIdx = -1;
  let header = null;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const h = mapHeader(rows[i] || []);
    if (h.hasQuestion) {
      headerIdx = i;
      header = h;
      break;
    }
  }
  if (!header || !header.ok) {
    return {
      items: [],
      questions: [],
      errors: [],
      found: 0,
      fatal:
        "Sarlavha qatori topilmadi. Birinchi qatorda ustunlar bo'lishi kerak: Question, A, B, C, D, CorrectAnswer.",
    };
  }
  const { map } = header;

  const items = [];
  const questions = [];
  const errors = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const cells = {
      question: cleanMultiline(r[map.question], 2000),
      A: cleanText(r[map.A], 500),
      B: cleanText(r[map.B], 500),
      C: cleanText(r[map.C], 500),
      D: cleanText(r[map.D], 500),
      correctRaw: cleanText(r[map.correct], 20),
    };
    const isEmpty = !cells.question && !cells.A && !cells.B && !cells.C && !cells.D && !cells.correctRaw;
    if (isEmpty) continue;

    if (items.length >= MAX_ROWS) {
      return {
        items,
        questions,
        errors,
        found: items.length,
        fatal: `Bir faylda ${MAX_ROWS} tadan ortiq savol bo'lmasligi kerak.`,
      };
    }

    const rowNo = i + 1; // Excel qator raqami
    const rowErrors = [];
    const warnings = [];
    if (!cells.question) rowErrors.push("Savol matni bo'sh.");
    const missing = LETTERS.filter((l) => !cells[l]);
    if (missing.length) rowErrors.push(`Variant(lar) bo'sh: ${missing.join(', ')}.`);

    // "B", "b", "B)" , "b." kabi yozuvlarni qabul qilish
    const correct = cells.correctRaw.replace(/[).\s]/g, '').toUpperCase();
    if (!LETTERS.includes(correct)) {
      rowErrors.push("CorrectAnswer noto'g'ri. Faqat A, B, C yoki D bo'lishi kerak.");
    }
    const lowered = LETTERS.map((l) => cells[l].toLowerCase()).filter(Boolean);
    if (new Set(lowered).size !== lowered.length) warnings.push('Ba\'zi variantlar bir xil.');

    const item = {
      index: items.length + 1,
      row: rowNo,
      ok: rowErrors.length === 0,
      question: cells.question,
      options: { A: cells.A, B: cells.B, C: cells.C, D: cells.D },
      correct: LETTERS.includes(correct) ? correct : null,
      errors: rowErrors,
      warnings,
    };
    items.push(item);
    if (item.ok) {
      questions.push({
        question: item.question,
        option_a: cells.A,
        option_b: cells.B,
        option_c: cells.C,
        option_d: cells.D,
        correct_answer: correct,
      });
    } else {
      rowErrors.forEach((message) => errors.push({ row: rowNo, message }));
    }
  }

  return { items, questions, errors, found: items.length };
}

/** .xlsx = ZIP arxiv, ya'ni "PK" bilan boshlanadi. */
function looksLikeXlsx(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function readQuestions(buffer) {
  const XLSX = require('xlsx');
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    return { items: [], questions: [], errors: [], found: 0, fatal: "Faylni o'qib bo'lmadi. To'g'ri .xlsx fayl yuklang." };
  }
  const name = wb.SheetNames[0];
  if (!name) return { items: [], questions: [], errors: [], found: 0, fatal: "Faylda varaq (sheet) topilmadi." };
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false, blankrows: true });
  return parseRows(rows);
}

function buildTemplate() {
  const XLSX = require('xlsx');
  const aoa = [
    ['Question', 'A', 'B', 'C', 'D', 'CorrectAnswer'],
    ["O'zbekiston qachon mustaqil bo'lgan?", '1989', '1991', '1995', '1992', 'B'],
    ['2+2 nechaga teng?', '3', '4', '5', '6', 'B'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 48 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildResultsWorkbook(testTitle, rows) {
  const XLSX = require('xlsx');
  const aoa = [['№', 'Familiya', 'Ism', "To'g'ri", 'Jami', 'Foiz (%)', 'Vaqt (daq:son)', 'Sahifadan chiqish', 'Topshirilgan']];
  rows.forEach((r, i) => aoa.push([i + 1, r.surname, r.name, r.score, r.total, r.percentage, r.time, r.violations || 0, r.submitted]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 22 }, { wch: 9 }, { wch: 7 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Natijalar');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { parseRows, looksLikeXlsx, readQuestions, buildTemplate, buildResultsWorkbook, MAX_ROWS };
