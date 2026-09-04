import { detectCvFileKind } from './cv-file-signature.util';

describe('detectCvFileKind', () => {
  it('detects a PDF by its magic bytes', () => {
    const buffer = Buffer.from('%PDF-1.4\nrest of a fake pdf');
    expect(detectCvFileKind(buffer)).toBe('pdf');
  });

  it('detects a legacy .doc (OLE Compound File) by its magic bytes', () => {
    const buffer = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.from('rest of a fake doc'),
    ]);
    expect(detectCvFileKind(buffer)).toBe('doc');
  });

  it('detects a .docx (zip containing a word/ entry) by its magic bytes', () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml rest of a fake docx'),
    ]);
    expect(detectCvFileKind(buffer)).toBe('docx');
  });

  it('rejects a zip that is not a Word document (e.g. a mislabeled .xlsx)', () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('xl/workbook.xml rest of a fake xlsx'),
    ]);
    expect(detectCvFileKind(buffer)).toBeNull();
  });

  it('rejects plain text content renamed with a .pdf extension', () => {
    const buffer = Buffer.from('just plain text, not a real pdf');
    expect(detectCvFileKind(buffer)).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(detectCvFileKind(Buffer.alloc(0))).toBeNull();
  });
});
