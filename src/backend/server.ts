import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initSettings } from './llama/settings';
import { getDataSource } from './llama/index';
import { createMessageContent } from '@llamaindex/core/response-synthesizers';
import { extractText } from '@llamaindex/core/utils';
import { PromptTemplate } from '@llamaindex/core/prompts';
import { MetadataMode } from 'llamaindex';

dotenv.config();
initSettings();

const app = express();

// Enable CORS - restrict origins if needed
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('Backend is healthy!');
});

app.post('/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({
        message: "A valid 'query' string parameter is required",
      });
      return;
    }
    console.log(`[server] Processing query: "${query}"`);

    const index = await getDataSource();
    if (!index) {
      throw new Error(
        `StorageContext is empty. Run 'npm run generate' to create the storage first.`
      );
    }
    const retriever = index.asRetriever();
    const nodes = await retriever.retrieve({ query });
    console.log(`[server] Retrieved ${nodes.length} nodes`);

    const contextSystemPrompt = new PromptTemplate({
      templateVars: ['context'],
      template: `You are a sales agent for "Revola AI". Your role is to proactively demo the product and answer any questions with enthusiasm and clarity. Always refer to the product as "Revola AI".\nContext:\n---------------------\n{context}\n---------------------`,
    });

    const content = await createMessageContent(
      contextSystemPrompt as any,
      nodes.map((r) => r.node),
      undefined,
      MetadataMode.LLM
    );
    const textAnswer = extractText(content);

    const imagePaths: string[] = [];
    nodes.forEach((nodeItem) => {
      const meta = (nodeItem.node as any).metadata;
      if (meta && meta.images && Array.isArray(meta.images)) {
        meta.images.forEach((img: any) => {
          if (img.path) {
            imagePaths.push(img.path);
          }
        });
      }
    });
    console.log('[server] Image paths:', imagePaths);

    res.status(200).json({ message: textAnswer, images: imagePaths });
  } catch (error) {
    console.error('[server] Error:', error);
    res.status(500).json({ message: (error as Error).message });
  }
});

const PORT = Number(process.env.PORT) || 2000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on http://0.0.0.0:${PORT}`);
});
