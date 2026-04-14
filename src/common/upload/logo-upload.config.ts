import { BadRequestException } from '@nestjs/common';
import { diskStorage, Options } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');
export const LOGOS_DIR = join(UPLOADS_DIR, 'logos');
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_LOGO_WIDTH = 800;
export const MAX_LOGO_HEIGHT = 400;

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

// Magic bytes for each allowed format
// WebP: RIFF at offset 0 + 'WEBP' at offset 8
const MAGIC_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF at offset 0
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP at offset 8
];

export function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const sigs = MAGIC_SIGNATURES.filter((s) => s.mime === mimetype);
  if (!sigs.length) return false;
  return sigs.every((sig) => {
    const base = sig.offset ?? 0;
    return sig.bytes.every((byte, i) => buffer[base + i] === byte);
  });
}

// Ensures uploads/logos directory exists (idempotent)
export function ensureLogosDir(): void {
  if (!existsSync(LOGOS_DIR)) mkdirSync(LOGOS_DIR, { recursive: true });
}

export const logoMulterOptions: Options = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      ensureLogosDir();
      cb(null, LOGOS_DIR);
    },
    filename: (req: any, file, cb) => {
      // One file per user — userId + original extension.
      // Old file is cleaned up in the service after upload.
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${req.user.id}${ext}`);
    },
  }),

  limits: { fileSize: MAX_LOGO_SIZE_BYTES },

  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        new BadRequestException(
          'Format de fichier non autorisé. Formats acceptés: PNG, JPEG, WebP.'
        )
      );
    }
    cb(null, true);
  },
};
