// pages/api/context.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { MetadataMode } from 'llamaindex';
import { getDataSource } from '../engine';
import { extractText } from '@llamaindex/core/utils';
import {
  PromptTemplate,
  type ContextSystemPrompt,
} from '@llamaindex/core/prompts';
import { createMessageContent } from '@llamaindex/core/response-synthesizers';
import { initSettings } from '../engine/settings';

type ResponseData = {
  message: string;
  images?: string[];
};

initSettings();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  try {
    const { query } = req.query;
    if (typeof query !== 'string' || query.trim() === '') {
      console.log('[context] Invalid query parameter');
      return res.status(400).json({
        message: "A valid 'query' string parameter is required in the URL",
      });
    }

    console.log(`[context] Processing query: "${query}"`);

    const index = await getDataSource();
    if (!index) {
      throw new Error(
        `StorageContext is empty - call 'npm run generate' to generate the storage first`,
      );
    }
    const retriever = index.asRetriever();

    // Retrieve the relevant nodes from the vector store
    const nodes = await retriever.retrieve({ query });
    // In pages/api/context.ts, after retrieval:
    console.log("[context] Retrieved nodes:", nodes);

    console.log(`[context] Retrieved ${nodes.length} nodes`);

    // Create a system prompt for context
    const contextSystemPrompt: ContextSystemPrompt = new PromptTemplate({
      templateVars: ['context'],
      template: `You are a sales agent for "Revola AI". Your role is to proactively demo the product and answer any questions with enthusiasm and clarity. Always refer to the product as "Revola AI" and avoid using any incorrect variations. For improving the answer to my last question, consider the following context:
---------------------
{context}
---------------------`,
    });

    // Generate the assistant's response content using the retrieved nodes
    const content = await createMessageContent(
      contextSystemPrompt as any,
      nodes.map((r) => r.node),
      undefined,
      MetadataMode.LLM,
    );

    // Extract the text answer from the generated content
    const textAnswer = extractText(content);

    // Extract image file paths from each node.
    // We assume that each node's metadata has an "images" field,
    // which is an array of objects with a "path" property.
    const imagePaths: string[] = [];
    nodes.forEach((nodeItem) => {
      const meta = (nodeItem.node as any).metadata;
      if (meta && meta.images && Array.isArray(meta.images)) {
        // Map each image object to its "path" property.
        meta.images.forEach((img: any) => {
          if (img.path) {
            imagePaths.push(img.path);
          }
        });
      }
    });
    console.log('[context] Image paths extracted:', imagePaths);

    // Return both the text answer and image paths in the JSON response.
    res.status(200).json({ message: textAnswer, images: imagePaths });
  } catch (error) {
    console.error('[context] Error:', error);
    return res.status(500).json({
      message: (error as Error).message,
    });
  }
}
