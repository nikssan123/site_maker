import { z } from 'zod';

export const AttachmentSchema = z.object({
  url: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
});

export type Attachment = z.infer<typeof AttachmentSchema>;
