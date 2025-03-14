// engine/loader.ts
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
  const allStandardDocuments = await new SimpleDirectoryReader().loadData({
    directoryPath: DATA_DIR,
  });

  const nonPdfDocuments = allStandardDocuments.filter(doc => {
    return !doc.metadata.source?.endsWith('.pdf');
  });
  console.log(`Loaded ${nonPdfDocuments.length} non-PDF documents`);


  const files = fs.readdirSync(DATA_DIR);
  const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
  console.log(`Found ${pdfFiles.length} PDF files for image extraction: ${pdfFiles.join(', ')}`);
  
  const pdfDocuments: Document[] = [];
  
  for (const file of pdfFiles) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const parsedPDF = await parsePDF(filePath);
      
      // For each page in the PDF, create a Document that includes only the images for that page
      for (const page of parsedPDF.pages) {
        // Filter images that belong to this page
        const pageImages = parsedPDF.extractedImages.filter(img => img.page === page.pageNumber);
        console.log(`For page ${page.pageNumber} of ${file}, images:`, pageImages);
        
        // Append caption to page text if available
        let pageText = page.text;
        if (pageImages.length > 0 && pageImages[0].caption) {
          pageText += `\n[Image Caption: ${pageImages[0].caption}]`;
        }
        
        // If this is page 23, add video data into the images array.
        if (page.pageNumber === 23) {
          // Push a video object into pageImages
          pageImages.push({
            type: 'video', 
            page: 23,
            key: 'demo',
            path: 'public/videos/demo.mp4', 
            caption: page.caption,
          } as any);
         
          pageText += `\n[Video Caption: ${page.caption}]`;
        }
        
        
        const document = new Document({
          text: pageText,
          metadata: {
            filename: file,
            source: filePath,
            private: 'false',
            pageNumber: page.pageNumber,
            images: pageImages, 
          },
        });
        pdfDocuments.push(document);
      }
      console.log(`Successfully processed PDF: ${file}`);
    } catch (error) {
      console.error(`Error processing PDF ${filePath}:`, error);
    }
  }
  
  const combinedDocuments = [...pdfDocuments];
  // const combinedDocuments = [...nonPdfDocuments, ...pdfDocuments];)
  
  for (const document of combinedDocuments) {
    document.metadata = {
      ...document.metadata,
      private: 'false',
    };
  }
  
  console.log(`Returning ${combinedDocuments.length} combined documents`);
  return combinedDocuments;
}
