import { SimpleDirectoryReader } from 'llamaindex';
import { parsePDF } from './pdfParser';
import { Document } from 'llamaindex';
import path from 'path';
import fs from 'fs';

export const DATA_DIR = './data';

export async function getDocuments() {
  console.log(`Getting documents from: ${DATA_DIR}`);
  
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`ERROR: Data directory does not exist: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created missing data directory: ${DATA_DIR}`);
  }
  
  // Load non-PDF documents if needed
  const standardDocuments = await new SimpleDirectoryReader().loadData({
    directoryPath: DATA_DIR,
  });
  
  // Process each PDF file with our custom parser
  const files = fs.readdirSync(DATA_DIR);
  const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
  console.log(`Found ${pdfFiles.length} PDF files for image extraction: ${pdfFiles.join(', ')}`);
  
  const pdfDocuments: Document[] = [];
  
  for (const file of pdfFiles) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const parsedPDF = await parsePDF(filePath);
      
      // Create a Document for each page
      for (const page of parsedPDF.pages) {
        // Filter images that belong to this page
        const pageImages = parsedPDF.extractedImages.filter(img => img.page === page.pageNumber);
        
        // Merge the caption (if any) into the page text
        let pageText = page.text;
        if (pageImages.length > 0 && pageImages[0].caption) {
          pageText += `\n[Image Caption: ${pageImages[0].caption}]`;
        }
        
        const document = new Document({
          text: pageText,
          metadata: {
            filename: file,
            source: filePath,
            private: 'false',
            pageNumber: page.pageNumber,
            images: pageImages, // Only the images from this page
          },
        });
        pdfDocuments.push(document);
      }
      console.log(`Successfully processed PDF: ${file}`);
    } catch (error) {
      console.error(`Error processing PDF ${filePath}:`, error);
    }
  }
  
  // Combine documents
  const allDocuments = [...standardDocuments, ...pdfDocuments];
  
  // Ensure private metadata is set
  for (const document of allDocuments) {
    document.metadata = {
      ...document.metadata,
      private: 'false',
    };
  }
  
  console.log(`Returning ${allDocuments.length} combined documents`);
  return allDocuments;
}
