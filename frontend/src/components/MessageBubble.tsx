import { Box, Stack, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import BrandMark from './BrandMark';

export interface MessageAttachment {
  url: string;
  filename: string;
  mimeType: string;
}

interface Props {
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[];
}

const PLAN_BLOCK = /```plan[\s\S]*?```|<PLAN>[\s\S]*?<\/PLAN>/gi;

export default function MessageBubble({ role, content, attachments }: Props) {
  const isUser = role === 'user';
  const displayContent = content.replace(PLAN_BLOCK, '').trim();
  const hasAttachments = Boolean(attachments && attachments.length > 0);

  if (isUser) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <Box
          sx={{
            maxWidth: '72%',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: '18px 18px 4px 18px',
            px: 2.5,
            py: 1.5,
            boxShadow: '0 4px 24px rgba(99,102,241,0.25)',
          }}
        >
          {hasAttachments && (
            <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: displayContent ? 1 : 0 }}>
              {attachments!.map((a) => (
                <Box
                  key={a.url}
                  component="img"
                  src={a.url}
                  alt={a.filename}
                  loading="lazy"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 1.25,
                    border: '1px solid rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </Stack>
          )}
          {displayContent && (
            <Typography variant="body1" sx={{ color: '#fff', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {displayContent}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 3 }}>
      <Box
        sx={{
          mt: 0.5,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #10b981)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <BrandMark size={14} color="#fff" strokeWidth={6} />
      </Box>
      <Box
        sx={{
          maxWidth: '80%',
          pt: 0.25,
          '& p': { m: 0, mb: 1, lineHeight: 1.75, color: 'text.primary', fontSize: '0.95rem' },
          '& p:last-child': { mb: 0 },
          '& strong': { color: 'primary.light', fontWeight: 600 },
          '& ol, & ul': { pl: 2.5, mb: 1, mt: 0.5 },
          '& li': { mb: 0.5, lineHeight: 1.7, color: 'text.primary', fontSize: '0.95rem' },
          '& li::marker': { color: 'primary.light' },
          '& h1, & h2, & h3': { mt: 1.5, mb: 0.5, fontWeight: 700, color: 'text.primary' },
          '& h1': { fontSize: '1.2rem' },
          '& h2': { fontSize: '1.05rem' },
          '& h3': { fontSize: '0.95rem' },
          '& code': {
            fontFamily: 'monospace',
            fontSize: '0.85em',
            bgcolor: 'rgba(99,102,241,0.12)',
            color: 'primary.light',
            px: 0.75,
            py: 0.25,
            borderRadius: 0.75,
          },
          '& blockquote': {
            borderLeft: '3px solid',
            borderColor: 'primary.main',
            pl: 1.5,
            ml: 0,
            my: 1,
            color: 'text.secondary',
          },
        }}
      >
        <ReactMarkdown>{displayContent}</ReactMarkdown>
      </Box>
    </Box>
  );
}
