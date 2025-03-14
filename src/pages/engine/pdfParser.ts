// engine/pdfParser.ts
import fs from 'fs';
import pdf from 'pdf-parse';
import { extractEmbeddedImages } from './pdfImageExtractor';

export async function parsePDF(filePath: string): Promise<{
  pages: { pageNumber: number; text: string; caption?: string }[];
  extractedImages: { page: number; key: string; path: string; caption?: string }[];
}> {
  // Read PDF file into buffer
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);

  // Use pdfData.numpages if available
  const numPages = pdfData.numpages || 1;
  // Split the text into an array – if \f is not present, we split evenly as a fallback.
  let pagesText = pdfData.text.split('\f');
  if (pagesText.length < numPages) {
    // Fallback: divide the text roughly evenly by numPages
    const avgLength = Math.floor(pdfData.text.length / numPages);
    pagesText = [];
    for (let i = 0; i < numPages; i++) {
      pagesText.push(pdfData.text.slice(i * avgLength, (i + 1) * avgLength));
    }
  }
  
  // Map pages and assign captions based on page number
  const pages = pagesText.map((text, index) => {
    const pageNumber = index + 1;
    let caption: string | undefined = undefined;
    switch (pageNumber) {
      case 1:
        caption = "How to Log In to Revola AI – Learn about passwordless authentication, prerequisites, and a step-by-step guide to log in.";
        break;
      case 3:
        caption = "How to Sign Up for Revola AI – Overview and step-by-step instructions for the sign-up process.";
        break;
      case 5:
        caption = "How to Add Seller Context – A guide to adding your seller context, including your URL, context sections, and troubleshooting.";
        break;
      case 8:
        caption = "How to Discover Prospects – Overview, prerequisites, and a step-by-step guide.";
        break;
      case 9:
        caption = "Prospect Discovery Filters – Instructions for setting filters and reviewing companies.";
        break;
      case 10:
        caption = "Troubleshooting & FAQs for Prospect Discovery – Common issues and questions.";
        break;
      case 12:
        caption = "Manual Company Research – Prerequisites and a step-by-step guide for company research.";
        break;
      case 13:
        caption = "Understanding the Company Research Interface – Overview of panels, contacts, and insights.";
        break;
      case 15:
        caption = "Troubleshooting & FAQs for Company Research – Common issues and solutions.";
        break;
      case 17:
        caption = "Generating Personalized Messages – How to create personalized emails, LinkedIn messages, and landing pages.";
        break;
      case 18:
        caption = "AI-Powered Personalization – Detailed guide to generating personalized messages.";
        break;
      case 20:
        caption = "How to Buy a Subscription – Step-by-step guide and key questions for purchasing a subscription.";
        break;
      case 21:
        caption = "Subscription Overview – Overview of the subscription process and details.";
        break;
      case 22:
        caption = "Troubleshooting & FAQs for Subscription and Logging Out – Common troubleshooting steps and FAQs.";
        break;
      case 23:
        // For page 23, this caption describes the video content.
        caption = "Video: Product Demo – Watch this demo video to see Revola AI in action and learn how to use its key features.";
        break;
      default:
        caption = undefined;
    }
    return { pageNumber, text, caption };
  });

  console.log("Parsed pages:", pages);

  // Extract images
  const images = await extractEmbeddedImages(filePath);
  // Merge caption from the corresponding page into each image
  const imagesWithCaptions = images.map(img => {
    const pageInfo = pages.find(p => p.pageNumber === img.page);
    return { ...img, caption: pageInfo?.caption };
  });
  console.log("Extracted images with captions:", imagesWithCaptions);

  return {
    pages,
    extractedImages: imagesWithCaptions,
  };
}
