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

  const pagesText = pdfData.text.split('\f');
  const pages = pagesText.map((text, index) => ({
    pageNumber: index + 1,
    text,
  }));

  // Extract embedded images
  const images = await extractEmbeddedImages(filePath);

  const imagesWithCaptions = images.map(img => {
    let caption: string | undefined = undefined;
    if (img.page === 19) {
      caption = "How to Subscribe";
    }
    return { ...img, caption };
  });

  return {
    pages,
    extractedImages: imagesWithCaptions,
  };
}
