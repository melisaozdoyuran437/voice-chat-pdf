import fs from 'fs';
import pdf from 'pdf-parse';
import { extractEmbeddedImages } from './pdfImageExtractor';

export async function parsePDF(filePath: string): Promise<{
  pages: { pageNumber: number; text: string }[];
  extractedImages: { page: number; key: string; path: string; caption?: string }[];
}> {
  // Read PDF file into a buffer
  const dataBuffer = fs.readFileSync(filePath);

  // Extract text from the PDF using pdf-parse
  const pdfData = await pdf(dataBuffer);
  
  // Split the full text into pages (assuming "\f" is the page delimiter)
  const pagesText = pdfData.text.split('\f');
  const pages = pagesText.map((text, index) => ({
    pageNumber: index + 1,
    text,
  }));

  // Extract embedded images
  const images = await extractEmbeddedImages(filePath);

  // Add captions (metadata) to images using a heuristic.
  // For example, if page 19 is about "How to subscribe", assign that caption.
  const imagesWithCaptions = images.map(img => {
    let caption: string | undefined = undefined;
    // You can use your own logic here—for example, based on page numbers or OCR on nearby text.
    if (img.page === 19) {
      caption = "How to Subscribe";
    }
    // You might add other conditions for other pages.
    return { ...img, caption };
  });

  return {
    pages,
    extractedImages: imagesWithCaptions,
  };
}
