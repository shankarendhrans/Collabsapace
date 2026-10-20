/**
 * Multi-Format Document Import & Export Service (.txt, .md, .docx, .pdf, .rtf, .html)
 */
export const SUPPORTED_IMPORT_EXTENSIONS = ["txt", "md", "docx", "pdf", "rtf", "html", "htm"];
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export function validateImportFile(file: File): { valid: boolean; ext: string; error?: string } {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      ext,
      error: `Unsupported file type '.${ext}'. Supported formats: .txt, .md, .docx, .pdf, .rtf, .html.`
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      valid: false,
      ext,
      error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 15 MB security limit.`
    };
  }
  return { valid: true, ext };
}
