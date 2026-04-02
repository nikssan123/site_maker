import { Box, Typography, Stack } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useTranslation } from 'react-i18next';
import { GenerationStep, FixAttempt } from '../store/project';

interface Props {
  steps: GenerationStep[];
  fixAttempts: FixAttempt[];
  /** Plain-language line from the server, e.g. “Working on…” */
  friendlyMessage?: string;
  /** Header above the progress bar (first-time build vs. updates) */
  progressTitle?: string;
}

export default function GenerationStatus({
  steps,
  fixAttempts,
  friendlyMessage = '',
  progressTitle,
}: Props) {
  const { t } = useTranslation();
  const title = progressTitle ?? t('generation.buildingApp');
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const progress = (doneCount / steps.length) * 100;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'rgba(99,102,241,0.3)',
        borderRadius: 3,
        p: 2.5,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(139,92,246,0.05) 100%)',
        backdropFilter: 'blur(8px)',
        mb: 2,
      }}
    >
      {/* Progress bar */}
      <Box sx={{ mb: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" mb={0.75}>
          <Typography variant="caption" color="primary.light" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('generation.percent', { n: Math.round(progress) })}</Typography>
        </Stack>
        <Box sx={{ height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <Box
            sx={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #10b981)',
              borderRadius: 2,
              transition: 'width 0.5s ease',
            }}
          />
        </Box>
      </Box>

      {friendlyMessage.trim() !== '' && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, lineHeight: 1.5 }}
        >
          {friendlyMessage}
        </Typography>
      )}

      {/* Steps */}
      <Stack gap={1.25}>
        {steps.map((step) => {
          const isDone = step.status === 'done';
          const isRunning = step.status === 'running';
          const isError = step.status === 'error';

          return (
            <Stack key={step.step} direction="row" alignItems="center" gap={1.5}>
              <Box sx={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isDone && <CheckCircleIcon sx={{ fontSize: 16, color: '#10b981' }} />}
                {isError && <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                {isRunning && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      boxShadow: '0 0 8px #6366f1',
                      animation: 'pulse 1.2s ease-in-out infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                        '50%': { opacity: 0.5, transform: 'scale(0.75)' },
                      },
                    }}
                  />
                )}
                {step.status === 'pending' && (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.12)' }} />
                )}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: isDone ? 'text.secondary' : isRunning ? 'text.primary' : 'text.disabled',
                  fontWeight: isRunning ? 600 : 400,
                  transition: 'color 0.3s',
                }}
              >
                {step.label}
                {isRunning && (
                  <Box component="span" sx={{ display: 'inline-flex', gap: '2px', ml: 0.75, verticalAlign: 'middle' }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        component="span"
                        sx={{
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          bgcolor: 'primary.light',
                          display: 'inline-block',
                          animation: 'dot 1.2s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`,
                          '@keyframes dot': {
                            '0%, 80%, 100%': { opacity: 0.2 },
                            '40%': { opacity: 1 },
                          },
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Typography>
            </Stack>
          );
        })}
      </Stack>

      {fixAttempts.length > 0 && (
        <Box
          sx={{
            mt: 2,
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
          <Typography variant="caption" color="warning.main">
            {t('generation.autoFixAttempt', { attempt: fixAttempts[fixAttempts.length - 1]!.attempt })}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
