/**
 * PDF Export Utilities — NotaKu Professional Report Templates
 *
 * Provides reusable functions to generate branded PDF reports using jsPDF.
 * All reports share a consistent look: logo, header block, colored sections,
 * table formatting, and a footer with page number + timestamp.
 */
import jsPDF from "jspdf";
import { formatRupiah, formatDate, formatDateTime } from "./format";

// ────────────────────────────────────────────
// Brand Colors (matching CSS tokens)
// ────────────────────────────────────────────
const C = {
  primary: [31, 58, 46] as const,        // #1F3A2E — deep green
  primaryDark: [22, 40, 31] as const,    // #16281F
  accent: [201, 154, 62] as const,       // #C99A3E — gold
  accentSoft: [244, 233, 210] as const,  // #F4E9D2
  bg: [247, 246, 242] as const,          // #F7F6F2
  surface: [255, 255, 255] as const,     // #FFFFFF
  border: [228, 225, 214] as const,      // #E4E1D6
  textPrimary: [32, 32, 28] as const,    // #20201C
  textSecondary: [107, 106, 96] as const,// #6B6A60
  textMuted: [156, 154, 142] as const,   // #9C9A8E
  success: [59, 109, 17] as const,       // #3B6D11
  successBg: [234, 243, 222] as const,   // #EAF3DE
  warning: [133, 79, 11] as const,       // #854F0B
  warningBg: [250, 238, 218] as const,   // #FAEEDA
  danger: [163, 45, 45] as const,        // #A32D2D
  dangerBg: [252, 235, 235] as const,    // #FCEBEB
  white: [255, 255, 255] as const,
} as const;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
type RGB = readonly [number, number, number];

function rgb(doc: jsPDF, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x, y, w, h, "F");
}

function line(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color: RGB = C.border, width = 0.2) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

/** Left-aligned text with explicit y. Returns the y used. */
function textL(doc: jsPDF, txt: string, x: number, y: number, opts: { size?: number; color?: RGB; style?: "normal" | "bold" | "italic" } = {}) {
  const { size = 10, color = C.textPrimary, style = "normal" } = opts;
  doc.setFontSize(size);
  doc.setFont("helvetica", style);
  rgb(doc, color);
  doc.text(txt, x, y);
  return y;
}

/** Right-aligned text. Returns the y used. */
function textR(doc: jsPDF, txt: string, x: number, y: number, opts: { size?: number; color?: RGB; style?: "normal" | "bold" | "italic" } = {}) {
  const { size = 10, color = C.textPrimary, style = "normal" } = opts;
  doc.setFontSize(size);
  doc.setFont("helvetica", style);
  rgb(doc, color);
  doc.text(txt, x, y, { align: "right" });
  return y;
}

/** Centered text. Returns the y used. */
function textC(doc: jsPDF, txt: string, y: number, opts: { size?: number; color?: RGB; style?: "normal" | "bold" | "italic" } = {}) {
  const { size = 10, color = C.textPrimary, style = "normal" } = opts;
  doc.setFontSize(size);
  doc.setFont("helvetica", style);
  rgb(doc, color);
  doc.text(txt, 105, y, { align: "center" });
  return y;
}

// ────────────────────────────────────────────
// Logo (Base64 PNG — small inline version)
// We generate a tiny 80×80 PNG at build time from the SVG.
// For now, we draw the brand mark as a simple colored rectangle with text.
// ────────────────────────────────────────────
const LOGO_MARK_SIZE = 18; // mm

function drawLogoMark(doc: jsPDF, x: number, y: number) {
  // Draw rounded-rect brand mark (mimics the SVG shape)
  doc.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
  doc.roundedRect(x, y, LOGO_MARK_SIZE, LOGO_MARK_SIZE, 3, 3, "F");

  // White inner circle
  doc.setFillColor(255, 255, 255);
  doc.circle(x + LOGO_MARK_SIZE / 2, y + LOGO_MARK_SIZE / 2, 5, "F");

  // Gold accent dot
  doc.setFillColor(C.accent[0], C.accent[1], C.accent[2]);
  doc.circle(x + LOGO_MARK_SIZE / 2, y + LOGO_MARK_SIZE / 2 + 1.5, 1.2, "F");
}

// ────────────────────────────────────────────
// Page header + footer shared by all reports
// ────────────────────────────────────────────
const MARGIN = { left: 14, right: 196, top: 14 };
const CONTENT_W = MARGIN.right - MARGIN.left; // 182mm
const PAGE_BOTTOM = 290; // mm

interface ReportMeta {
  title: string;
  subtitle?: string; // branch name
  period: string;
  exportedBy: string;
}

/** Draws logo + title block, returns y after block (next usable line). */
function drawHeader(doc: jsPDF, meta: ReportMeta): number {
  let y = MARGIN.top;

  // ── Brand mark + company name ──
  drawLogoMark(doc, MARGIN.left, y);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  rgb(doc, C.primary);
  doc.text("NotaKu", MARGIN.left + LOGO_MARK_SIZE + 4, y + 5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  rgb(doc, C.textMuted);
  doc.text("Branch Bill Log", MARGIN.left + LOGO_MARK_SIZE + 4, y + 10);

  y += LOGO_MARK_SIZE + 4;

  // ── Report title ──
  line(doc, MARGIN.left, y, MARGIN.right, y, C.border, 0.5);
  y += 7;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  rgb(doc, C.primary);
  doc.text(meta.title, 105, y, { align: "center" });
  y += 6;

  if (meta.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    rgb(doc, C.textPrimary);
    doc.text(meta.subtitle, 105, y, { align: "center" });
    y += 5;
  }

  // Period + exported by
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  rgb(doc, C.textSecondary);
  doc.text(`Periode: ${meta.period}`, 105, y, { align: "center" });
  y += 4;
  doc.text(`Diekspor: ${meta.exportedBy} • ${formatDateTime(new Date())}`, 105, y, { align: "center" });
  y += 4;

  line(doc, MARGIN.left, y, MARGIN.right, y, C.border, 0.5);
  y += 7;

  return y;
}

/** Draws footer on every page. */
function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const y = PAGE_BOTTOM + 4;
  line(doc, MARGIN.left, y - 2, MARGIN.right, y - 2, C.border, 0.3);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  rgb(doc, C.textMuted);
  doc.text("NotaKu — Branch Bill Log", MARGIN.left, y + 2);
  doc.text(`Halaman ${pageNum} / ${totalPages}`, MARGIN.right, y + 2, { align: "right" });
}

// ────────────────────────────────────────────
// Section box helper
// ────────────────────────────────────────────
function drawSectionHeader(doc: jsPDF, y: number, num: string, label: string, tag?: string): number {
  // Background bar
  fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 7, C.bg);
  rgb(doc, C.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${num}. ${label}`, MARGIN.left + 3, y);
  if (tag) {
    rgb(doc, C.textMuted);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(tag, MARGIN.right - 3, y, { align: "right" });
  }
  return y + 7;
}

function drawRow(doc: jsPDF, y: number, label: string, value: string, opts?: { bold?: boolean; bg?: RGB; labelColor?: RGB; valueColor?: RGB }): number {
  const { bold = false, bg, labelColor = C.textSecondary, valueColor = C.textPrimary } = opts ?? {};
  if (bg) {
    fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 6, bg);
  }
  doc.setFontSize(10);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  rgb(doc, bold ? C.primary : labelColor);
  doc.text(label, MARGIN.left + 4, y);
  rgb(doc, bold ? C.primary : valueColor);
  doc.setFont("helvetica", "bold");
  doc.text(value, MARGIN.right - 4, y, { align: "right" });
  return y + 5.5;
}

// ════════════════════════════════════════════
//  PUBLIC: LABA RUGI PDF
// ════════════════════════════════════════════
interface LabaRugiData {
  branchName: string;
  period: string; // "1 Jan 2026 s/d 31 Jan 2026"
  exportedBy: string;
  totalOmset: number;
  totalPaidInvoices: number;
  totalUnpaidInvoices: number;
  totalInvoices: number;
  expensesBySupplier: { name: string; total: number }[];
}

export function generateLabaRugiPDF(data: LabaRugiData): void {
  const doc = new jsPDF();
  const netProfit = data.totalOmset - data.totalInvoices;
  const marginPct = data.totalOmset > 0 ? (netProfit / data.totalOmset) * 100 : 0;

  let y = drawHeader(doc, {
    title: "LAPORAN LABA RUGI",
    subtitle: data.branchName,
    period: data.period,
    exportedBy: data.exportedBy,
  });

  // ── 1. Pendapatan ──
  y = drawSectionHeader(doc, y, "1", "PENDAPATAN OPERASIONAL", "PENJUALAN");
  y += 1;
  y = drawRow(doc, y, "Omset Penjualan Harian", formatRupiah(data.totalOmset));
  y += 1;
  y = drawRow(doc, y, "Total Pendapatan Bersih (A)", formatRupiah(data.totalOmset), {
    bold: true, bg: C.successBg, labelColor: C.success, valueColor: C.success,
  });
  y += 4;

  // ── 2. Pengeluaran ──
  y = drawSectionHeader(doc, y, "2", "BEBAN OPERASIONAL (NOTA SUPPLIER)", "PENGELUARAN");
  y += 1;
  y = drawRow(doc, y, "Nota Lunas (Terbayar)", formatRupiah(data.totalPaidInvoices), { valueColor: C.warning });
  y = drawRow(doc, y, "Nota Hutang (Belum Dibayar)", formatRupiah(data.totalUnpaidInvoices), { valueColor: C.danger });
  y += 1;
  y = drawRow(doc, y, "Total Beban Operasional (B)", formatRupiah(data.totalInvoices), {
    bold: true, bg: C.dangerBg, labelColor: C.danger, valueColor: C.danger,
  });
  y += 4;

  // ── 3. Laba Rugi Bersih ──
  y = drawSectionHeader(doc, y, "3", "HASIL BERSIH (A − B)");
  y += 2;

  const profitColor = netProfit >= 0 ? C.success : C.danger;
  const profitBg = netProfit >= 0 ? C.successBg : C.dangerBg;
  fillRect(doc, MARGIN.left, y - 5, CONTENT_W, 14, profitBg);
  line(doc, MARGIN.left, y - 5, MARGIN.left, y + 9, profitColor, 1);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  rgb(doc, profitColor);
  doc.text("LABA / (RUGI) BERSIH", MARGIN.left + 6, y);
  doc.setFontSize(14);
  doc.text(formatRupiah(netProfit), MARGIN.right - 6, y, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Margin Keuntungan: ${marginPct.toFixed(1)}%`, MARGIN.left + 6, y + 6);
  y += 14;

  // ── 4. Rincian per Supplier (jika ada) ──
  if (data.expensesBySupplier.length > 0) {
    y += 4;
    y = drawSectionHeader(doc, y, "4", "RINCIAN BEBAN PER SUPPLIER");
    y += 1;

    // Table header
    fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 6, C.bg);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    rgb(doc, C.textPrimary);
    doc.text("No", MARGIN.left + 3, y);
    doc.text("Nama Supplier", MARGIN.left + 12, y);
    doc.text("Total", MARGIN.right - 4, y, { align: "right" });
    doc.text("%", MARGIN.right - 28, y, { align: "right" });
    y += 5;

    data.expensesBySupplier.forEach((s, idx) => {
      if (y > PAGE_BOTTOM - 20) {
        doc.addPage();
        drawFooter(doc, doc.getNumberOfPages() - 1, doc.getNumberOfPages() - 1);
        y = MARGIN.top + 5;
      }

      const pct = data.totalInvoices > 0 ? ((s.total / data.totalInvoices) * 100).toFixed(1) : "0";
      if (idx % 2 === 0) {
        fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 5.5, [250, 250, 248]);
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      rgb(doc, C.textMuted);
      doc.text(String(idx + 1), MARGIN.left + 4, y);
      rgb(doc, C.textPrimary);
      doc.text(s.name.length > 30 ? s.name.slice(0, 28) + "…" : s.name, MARGIN.left + 12, y);
      rgb(doc, C.textSecondary);
      doc.text(`${pct}%`, MARGIN.right - 28, y, { align: "right" });
      rgb(doc, C.textPrimary);
      doc.setFont("helvetica", "bold");
      doc.text(formatRupiah(s.total), MARGIN.right - 4, y, { align: "right" });
      y += 5.5;
    });
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  // Sanitize filename
  const safe = data.branchName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  doc.save(`LabaRugi_${safe}_${Date.now()}.pdf`);
}

// ════════════════════════════════════════════
//  PUBLIC: LAPORAN NOTA PDF
// ════════════════════════════════════════════
interface NotaItem {
  invoice_date: string;
  supplier: string;
  item_name: string;
  qty: number;
  price: number;
  total: number;
  status: "BELUM" | "SUDAH";
  paid_at?: string | null;
}

interface NotaLaporanData {
  branchName: string;
  period: string;
  exportedBy: string;
  items: NotaItem[];
  totalFiltered: number;
  paidTotal: number;
  unpaidTotal: number;
  supplierSummary: {
    name: string;
    count: number;
    paid: number;
    unpaid: number;
    total: number;
    bankName?: string;
    bankAccount?: string;
    accountHolder?: string;
  }[];
}

export function generateNotaLaporanPDF(data: NotaLaporanData): void {
  const doc = new jsPDF({ orientation: "landscape" });

  let y = drawHeader(doc, {
    title: "LAPORAN DAFTAR NOTA",
    subtitle: data.branchName,
    period: data.period,
    exportedBy: data.exportedBy,
  });

  // ── Summary Row ──
  fillRect(doc, MARGIN.left, y - 4, CONTENT_W, 10, C.bg);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  rgb(doc, C.primary);
  doc.text(`Total Nota: ${data.items.length}`, MARGIN.left + 4, y);
  rgb(doc, C.success);
  doc.text(`Lunas: ${formatRupiah(data.paidTotal)}`, MARGIN.left + 60, y);
  rgb(doc, C.danger);
  doc.text(`Belum: ${formatRupiah(data.unpaidTotal)}`, MARGIN.left + 115, y);
  rgb(doc, C.primary);
  doc.text(`Grand Total: ${formatRupiah(data.totalFiltered)}`, MARGIN.right - 4, y, { align: "right" });
  y += 10;

  // ── Table Header ──
  // Column positions for landscape
  const cols = [
    { x: MARGIN.left + 3, label: "No", w: 8 },
    { x: MARGIN.left + 15, label: "Tanggal", w: 22 },
    { x: MARGIN.left + 40, label: "Supplier", w: 45 },
    { x: MARGIN.left + 88, label: "Barang", w: 50 },
    { x: MARGIN.left + 142, label: "Qty", w: 12 },
    { x: MARGIN.left + 158, label: "Harga", w: 28 },
    { x: MARGIN.left + 190, label: "Total", w: 30 },
    { x: MARGIN.left + 225, label: "Status", w: 22 },
  ];

  fillRect(doc, MARGIN.left, y - 4, CONTENT_W, 7, C.primary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  rgb(doc, C.white);
  cols.forEach((c) => {
    doc.text(c.label, c.x, y);
  });
  y += 7;

  // ── Table Rows ──
  data.items.forEach((item, idx) => {
    if (y > PAGE_BOTTOM - 10) {
      doc.addPage();
      drawFooter(doc, doc.getNumberOfPages() - 1, doc.getNumberOfPages() - 1);
      y = MARGIN.top + 5;
      // Re-draw header on new page
      fillRect(doc, MARGIN.left, y - 4, CONTENT_W, 7, C.primary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      rgb(doc, C.white);
      cols.forEach((c) => {
        doc.text(c.label, c.x, y);
      });
      y += 7;
    }

    // Zebra striping
    if (idx % 2 === 0) {
      fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 6, [250, 250, 248]);
    }

    const statusColor = item.status === "SUDAH" ? C.success : C.danger;
    const statusLabel = item.status === "SUDAH" ? "LUNAS" : "BELUM";

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    rgb(doc, C.textMuted);
    doc.text(String(idx + 1), cols[0].x, y);
    rgb(doc, C.textSecondary);
    doc.text(formatDate(item.invoice_date), cols[1].x, y);
    rgb(doc, C.textPrimary);
    doc.text(item.supplier.length > 22 ? item.supplier.slice(0, 20) + "…" : item.supplier, cols[2].x, y);
    doc.text(item.item_name.length > 25 ? item.item_name.slice(0, 23) + "…" : item.item_name, cols[3].x, y);
    rgb(doc, C.textSecondary);
    doc.text(String(item.qty), cols[4].x, y);
    doc.text(formatRupiah(item.price), cols[5].x, y);
    doc.setFont("helvetica", "bold");
    rgb(doc, C.textPrimary);
    doc.text(formatRupiah(item.total), cols[6].x, y);
    // Status pill
    const statusW = doc.getStringUnitWidth(statusLabel) * 7.5 / doc.internal.scaleFactor;
    fillRect(doc, cols[7].x - 1, y - 3, statusW + 6, 5, statusColor[0] === 59 ? C.successBg : C.dangerBg);
    rgb(doc, statusColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(statusLabel, cols[7].x + 2, y);

    y += 6;
  });

  // ── Grand Total Row ──
  y += 2;
  fillRect(doc, MARGIN.left, y - 4, CONTENT_W, 8, C.bg);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  rgb(doc, C.primary);
  doc.text("GRAND TOTAL", cols[2].x, y);
  doc.text(formatRupiah(data.totalFiltered), cols[6].x, y);

  y += 14;

  // ── Supplier Summary ──
  if (data.supplierSummary.length > 0) {
    if (y > PAGE_BOTTOM - 60) {
      doc.addPage();
      drawFooter(doc, doc.getNumberOfPages() - 1, doc.getNumberOfPages() - 1);
      y = MARGIN.top + 5;
    }

    y = drawSectionHeader(doc, y, "A", "RINGKASAN PER SUPPLIER");
    y += 1;

    const sCols = [
      { x: MARGIN.left + 3, label: "No" },
      { x: MARGIN.left + 14, label: "Supplier" },
      { x: MARGIN.left + 60, label: "Nota" },
      { x: MARGIN.left + 75, label: "Dibayar" },
      { x: MARGIN.left + 110, label: "Belum" },
      { x: MARGIN.left + 145, label: "Total" },
      { x: MARGIN.left + 180, label: "Bank" },
      { x: MARGIN.left + 210, label: "No. Rekening" },
    ];

    fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 6, C.primary);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    rgb(doc, C.white);
    sCols.forEach((c) => doc.text(c.label, c.x, y));
    y += 6;

    data.supplierSummary.forEach((s, idx) => {
      if (y > PAGE_BOTTOM - 10) {
        doc.addPage();
        drawFooter(doc, doc.getNumberOfPages() - 1, doc.getNumberOfPages() - 1);
        y = MARGIN.top + 5;
      }

      if (idx % 2 === 0) {
        fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 5.5, [250, 250, 248]);
      }

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      rgb(doc, C.textMuted);
      doc.text(String(idx + 1), sCols[0].x, y);
      rgb(doc, C.textPrimary);
      doc.text(s.name.length > 22 ? s.name.slice(0, 20) + "…" : s.name, sCols[1].x, y);
      rgb(doc, C.textSecondary);
      doc.text(String(s.count), sCols[2].x, y);
      rgb(doc, C.success);
      doc.text(formatRupiah(s.paid), sCols[3].x, y);
      rgb(doc, C.danger);
      doc.text(formatRupiah(s.unpaid), sCols[4].x, y);
      doc.setFont("helvetica", "bold");
      rgb(doc, C.textPrimary);
      doc.text(formatRupiah(s.total), sCols[5].x, y);
      rgb(doc, C.textSecondary);
      doc.setFont("helvetica", "normal");
      doc.text(s.bankName || "-", sCols[6].x, y);
      doc.text(s.bankAccount || "-", sCols[7].x, y);
      y += 5.5;
    });

    // Supplier Grand Total
    const gTotal = data.supplierSummary.reduce((s, x) => s + x.total, 0);
    fillRect(doc, MARGIN.left, y - 3.5, CONTENT_W, 6, C.bg);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    rgb(doc, C.primary);
    doc.text("GRAND TOTAL", sCols[1].x, y);
    rgb(doc, C.textPrimary);
    doc.text(formatRupiah(gTotal), sCols[5].x, y);
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  const safe = data.branchName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  doc.save(`LaporanNota_${safe}_${Date.now()}.pdf`);
}
