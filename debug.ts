import path from 'path';
import fs from 'fs';

console.log('Current working directory:', process.cwd());
console.log('Files in current directory:', fs.readdirSync('.'));

// Check if data directory exists
const dataDir = './data';
console.log(`Does ${dataDir} exist?`, fs.existsSync(dataDir));
if (fs.existsSync(dataDir)) {
  console.log(`Files in ${dataDir}:`, fs.readdirSync(dataDir));
}

// Check if test directory exists
const testDir = './test';
console.log(`Does ${testDir} exist?`, fs.existsSync(testDir));
if (fs.existsSync(testDir)) {
  console.log(`Files in ${testDir}:`, fs.readdirSync(testDir));
  
  // Check if test/data directory exists
  const testDataDir = './test/data';
  console.log(`Does ${testDataDir} exist?`, fs.existsSync(testDataDir));
  if (fs.existsSync(testDataDir)) {
    console.log(`Files in ${testDataDir}:`, fs.readdirSync(testDataDir));
  }
}

// Check if any environment variables might be influencing file paths
console.log('Environment variables:', process.env);

// Create the workaround for pdf-parse package BEFORE importing it
function setupPdfParseWorkaround() {
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

// Setup the workaround
setupPdfParseWorkaround();

// Check if the specific file now exists
const specificFile = './test/data/05-versions-space.pdf';
console.log(`Does specific file exist? ${specificFile}:`, fs.existsSync(specificFile));

// Now try to identify what's importing pdf-parse
async function testPdfParse() {
  try {
    console.log('Looking for imports of pdf-parse in node_modules');
    // Use dynamic import
    const pdfParse = await import('pdf-parse');
    console.log('pdf-parse imported successfully');
  } catch (error) {
    console.error('Error importing pdf-parse:', error);
  }
}

// Run the test
testPdfParse();