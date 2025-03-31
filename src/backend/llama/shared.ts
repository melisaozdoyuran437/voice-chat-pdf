import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STORAGE_CACHE_DIR = path.resolve(__dirname, '../../cache');

export const IMAGES_DIR = path.resolve(__dirname, '../../frontend/public/images');
