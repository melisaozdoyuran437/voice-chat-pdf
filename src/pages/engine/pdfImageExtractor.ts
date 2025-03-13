// engine/pdfImageExtractor.ts
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFNumber } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PNG } from 'pngjs';

export async function extractEmbeddedImages(filePath: string): Promise<{ page: number; key: string; path: string; }[]> {
  // Load the PDF using pdf-lib
  const dataBuffer = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(dataBuffer);
  const pages = pdfDoc.getPages();
  const extractedImages: { page: number; key: string; path: string; }[] = [];

  // Ensure output directory for images exists
  const imagesDir = "./public/images";
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Loop through each page
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const resources = page.node.Resources();
    if (!resources) continue;

    const xObjects = resources.get(PDFName.of("XObject"));
    if (!xObjects) continue;

    const xObjectsDict = xObjects as PDFDict;
    for (const [key, xObjectRef] of xObjectsDict.entries()) {
      const xObject = pdfDoc.context.lookup(xObjectRef);
      if (xObject instanceof PDFRawStream) {
        // Get raw bytes
        let imageBytes = xObject.getContents();
        const filter = xObject.dict.get(PDFName.of("Filter"));
        console.log(`Page ${i+1}, key ${key.toString()}: Filter value: ${filter?.toString()}`);

        let extension = "bin";
        if (filter && filter.toString().includes("DCTDecode")) {
          extension = "jpg";
          // JPEG: raw bytes are typically valid.
        } else if (filter && filter.toString().includes("FlateDecode")) {
          extension = "png";
          try {
            // Decompress the FlateDecode stream
            const rawImageBytes = zlib.inflateSync(imageBytes);
            // Extract image parameters using .asNumber() to get numeric values
            const widthObj = xObject.dict.get(PDFName.of("Width"));
            const heightObj = xObject.dict.get(PDFName.of("Height"));
            const bitsObj = xObject.dict.get(PDFName.of("BitsPerComponent"));
            const csObj = xObject.dict.get(PDFName.of("ColorSpace"));

            if (!widthObj || !heightObj || !bitsObj || !csObj) {
              throw new Error("Missing image parameters (Width, Height, BitsPerComponent, ColorSpace)");
            }
            const width = (widthObj as PDFNumber).asNumber();
            const height = (heightObj as PDFNumber).asNumber();
            const bitsPerComponent = (bitsObj as PDFNumber).asNumber();
            let colorSpace = csObj.toString(); // e.g. '/DeviceRGB' or '/DeviceGray' or '/ICCBased ...'

            let effectiveColorSpace = "";
            if (colorSpace.includes("ICCBased")) {
            // Attempt to handle ICCBased color spaces that might be defined as an array.
            let iccDict: any;
            // If csObj is an array, get the second element; otherwise, lookup the object.
            if (Array.isArray(csObj)) {
                iccDict = pdfDoc.context.lookup(csObj[1]);
            } else {
                iccDict = pdfDoc.context.lookup(csObj);
            }
            const nObj = iccDict instanceof PDFDict ? iccDict.get(PDFName.of("N")) : undefined;
            const n = nObj ? (nObj as PDFNumber).asNumber() : undefined;
            console.log(`ICCBased color space: N = ${n}`);
            if (n === 1) {
                effectiveColorSpace = "DeviceGray";
            } else if (n === 3) {
                effectiveColorSpace = "DeviceRGB";
            } else {
                // Fallback: assume RGB if not defined.
                effectiveColorSpace = "DeviceRGB";
                console.warn(`Falling back to DeviceRGB for ICCBased color space on page ${i+1}, key ${key.toString()}`);
            }
            } else if (colorSpace.includes("DeviceGray")) {
            effectiveColorSpace = "DeviceGray";
            } else if (colorSpace.includes("DeviceRGB")) {
            effectiveColorSpace = "DeviceRGB";
            } else {
            effectiveColorSpace = "Unsupported";
            }

            if (effectiveColorSpace === "Unsupported") {
              console.warn(`Unsupported ColorSpace encountered on page ${i+1}, key ${key.toString()}: ${colorSpace}`);
              continue;
            }

            console.log(`Image parameters: width=${width}, height=${height}, bitsPerComponent=${bitsPerComponent}, effectiveColorSpace=${effectiveColorSpace}`);

            // Create a new PNG using pngjs
            const png = new PNG({ width, height });

            if (effectiveColorSpace === "DeviceGray") {
              // Expect raw data: one byte per pixel
              if (rawImageBytes.length !== width * height) {
                throw new Error("Unexpected data length for DeviceGray image");
              }
              for (let j = 0; j < width * height; j++) {
                const gray = rawImageBytes[j];
                png.data[j * 4] = gray;
                png.data[j * 4 + 1] = gray;
                png.data[j * 4 + 2] = gray;
                png.data[j * 4 + 3] = 255;
              }
            } else if (effectiveColorSpace === "DeviceRGB") {
              // Expect raw data: three bytes per pixel
              if (rawImageBytes.length !== width * height * 3) {
                throw new Error("Unexpected data length for DeviceRGB image");
              }
              for (let j = 0; j < width * height; j++) {
                png.data[j * 4] = rawImageBytes[j * 3];
                png.data[j * 4 + 1] = rawImageBytes[j * 3 + 1];
                png.data[j * 4 + 2] = rawImageBytes[j * 3 + 2];
                png.data[j * 4 + 3] = 255;
              }
            }

            // Write the PNG image to a buffer
            imageBytes = PNG.sync.write(png);
          } catch (err) {
            console.error(`Error processing FlateDecode image on page ${i+1}, key ${key.toString()}:`, err);
            continue;
          }
        }

        // Sanitize the key
        const sanitizedKey = key.toString().replace(/[\/\\]/g, '_');
        // Create a file name and save the image
        const imageFileName = `extracted_page${i + 1}_${sanitizedKey}.${extension}`;
        const imagePath = path.join("public", "images", imageFileName);
        fs.writeFileSync(imagePath, imageBytes);
        extractedImages.push({
          page: i + 1,
          key: sanitizedKey,
          path: imagePath,
        });
        console.log(`Saved extracted image to: ${imagePath}`);
      }
    }
  }
  return extractedImages;
}
