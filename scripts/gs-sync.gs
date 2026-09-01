/**
 * Google Apps Script - NotaKu Google Sheets Sync
 *
 * CARA PAKAI:
 * 1. Buat Google Sheet baru
 * 2. Buka Extensions > Apps Script
 * 3. Hapus kode default, lalu tempel seluruh kode ini
 * 4. Rename file dari "Code.gs" menjadi "Code.gs"
 * 5. Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Klik Deploy > Copy URL
 * 7. Paste URL ke Pengaturan Google Sheets di NotaKu
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === "test_connection") {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Connection OK", timestamp: new Date().toISOString() })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "sync_invoices") {
      return syncInvoices(payload);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Unknown action: " + action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function syncInvoices(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Get or create "Daftar Nota" sheet
  let sheet = ss.getSheetByName("Daftar Nota");
  if (!sheet) {
    sheet = ss.insertSheet("Daftar Nota");
    // Add headers
    const headers = [
      "ID Nota", "Cabang", "Tanggal Nota", "Supplier", "Nama Barang",
      "Qty", "Harga Satuan", "Total", "Status", "Dibuat Oleh", "Waktu Input"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1a56db").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120); // ID
    sheet.setColumnWidth(2, 150); // Cabang
    sheet.setColumnWidth(3, 100); // Tanggal
    sheet.setColumnWidth(4, 180); // Supplier
    sheet.setColumnWidth(5, 200); // Barang
    sheet.setColumnWidth(6, 60);  // Qty
    sheet.setColumnWidth(7, 120); // Harga
    sheet.setColumnWidth(8, 140); // Total
    sheet.setColumnWidth(9, 80);  // Status
    sheet.setColumnWidth(10, 150); // Dibuat
    sheet.setColumnWidth(11, 150); // Waktu
  }

  const rows = payload.data || [];
  if (rows.length === 0) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "No data to sync", synced: 0 })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Build rows array
  const newRows = rows.map(function(row) {
    return [
      row.id || "",
      row.branch_name || "",
      row.invoice_date || "",
      row.supplier || "",
      row.item_name || "",
      row.qty || 0,
      row.price || 0,
      row.total || 0,
      row.status || "BELUM",
      row.created_by_name || "",
      row.created_at || "",
    ];
  });

  // Check for existing IDs to avoid duplicates
  const existingIds = [];
  if (sheet.getLastRow() > 1) {
    const idColumn = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < idColumn.length; i++) {
      existingIds.push(String(idColumn[i][0]));
    }
  }

  // Filter out duplicates
  const uniqueRows = [];
  for (let i = 0; i < newRows.length; i++) {
    if (existingIds.indexOf(String(newRows[i][0])) === -1) {
      uniqueRows.push(newRows[i]);
    }
  }

  if (uniqueRows.length === 0) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "All data already exists", synced: 0, duplicates: newRows.length })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Append new rows
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, uniqueRows.length, uniqueRows[0].length).setValues(uniqueRows);

  // Format status column
  const statusRange = sheet.getRange(lastRow + 1, 9, uniqueRows.length, 1);
  for (let i = 0; i < uniqueRows.length; i++) {
    const cell = statusRange.getCell(i + 1, 1);
    if (uniqueRows[i][8] === "SUDAH") {
      cell.setBackground("#d1fae5").setFontColor("#065f46");
    } else {
      cell.setBackground("#fef3c7").setFontColor("#92400e");
    }
  }

  // Format total column as Rupiah
  const totalRange = sheet.getRange(lastRow + 1, 8, uniqueRows.length, 1);
  totalRange.setNumberFormat("#,##0");

  // Format harga column as Rupiah
  const hargaRange = sheet.getRange(lastRow + 1, 7, uniqueRows.length, 1);
  hargaRange.setNumberFormat("#,##0");

  return ContentService.createTextOutput(
    JSON.stringify({
      success: true,
      message: "Sync OK",
      synced: uniqueRows.length,
      duplicates: newRows.length - uniqueRows.length,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Setup sheet headers (jalankan manual sekali dari editor)
 */
function setupHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Daftar Nota");
  if (!sheet) {
    sheet = ss.insertSheet("Daftar Nota");
  }
  const headers = [
    "ID Nota", "Cabang", "Tanggal Nota", "Supplier", "Nama Barang",
    "Qty", "Harga Satuan", "Total", "Status", "Dibuat Oleh", "Waktu Input"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1a56db").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}
