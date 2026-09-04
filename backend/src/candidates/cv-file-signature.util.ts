// docs/security.md §11: "Validate by inspecting file content/magic bytes,
// not just the extension or client-reported MIME type (a renamed .exe
// claiming to be a PDF must be rejected)." Hand-rolled rather than pulling
// in a dependency for three known signatures -- `file-type`'s current
// major version is ESM-only, which doesn't import cleanly into this
// CommonJS backend (tsconfig `module: commonjs`).
export type CvFileKind = 'pdf' | 'doc' | 'docx';

const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
// Legacy OLE Compound File header -- .doc (and old .xls/.ppt) all share it.
const DOC_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
// ZIP local file header -- shared by .docx/.xlsx/.pptx/.jar/plain .zip, so
// on its own this only proves "some zip", not specifically a Word doc.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function detectCvFileKind(buffer: Buffer): CvFileKind | null {
  if (buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    return 'pdf';
  }
  if (buffer.subarray(0, DOC_SIGNATURE.length).equals(DOC_SIGNATURE)) {
    return 'doc';
  }
  if (buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
    // DOCX-specific heuristic: local file header entry names appear as
    // plain (uncompressed) text within a zip's raw bytes, so a genuine
    // Word document's archive contains the literal string "word/" near
    // the start (its [Content_Types].xml / word/document.xml entries) --
    // good enough to reject a same-signature .xlsx/.pptx/.zip mislabeled
    // as a .docx, without a full zip parser.
    const header = buffer.subarray(0, Math.min(buffer.length, 4096));
    return header.includes('word/') ? 'docx' : null;
  }
  return null;
}
