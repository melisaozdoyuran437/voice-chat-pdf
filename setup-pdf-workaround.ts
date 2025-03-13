import fs from 'fs';
import path from 'path';

// This is a workaround for the pdf-parse package's internal tests
// that might be looking for this specific file
export function setupPdfParseWorkaround() {
  const testDir = './test/data';
  
  // Create test directory if it doesn't exist
  if (!fs.existsSync('./test')) {
    fs.mkdirSync('./test', { recursive: true });
    console.log(`Created directory: ./test`);
  }
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`Created directory: ${testDir}`);
  }
  
  // Create an empty PDF file to satisfy pdf-parse's internal checks
  const testFilePath = path.join(testDir, '05-versions-space.pdf');
  if (!fs.existsSync(testFilePath)) {
    // Create a minimal valid PDF file (header only)
    const minimalPdf = Buffer.from("%PDF-1.4\n%EOF\n");
    fs.writeFileSync(testFilePath, minimalPdf);
    console.log(`Created minimal PDF at: ${testFilePath}`);
  }
}

// Run this setup immediately when this module is imported
setupPdfParseWorkaround();