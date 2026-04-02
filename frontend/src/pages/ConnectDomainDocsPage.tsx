import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Alert,
  Paper,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuBookIcon from '@mui/icons-material/MenuBook';

export default function ConnectDomainDocsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 3, px: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          sx={{ mb: 2, color: 'text.secondary' }}
        >
          {t('domainDocs.back')}
        </Button>

        <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
          <MenuBookIcon color="primary" />
          <Typography variant="h4" fontWeight={800} letterSpacing="-0.5px">
            {t('domainDocs.title')}
          </Typography>
        </Stack>

        <Typography variant="body1" color="text.secondary" paragraph>
          {t('domainDocs.intro')}
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          {t('domainDocs.alertNoSell')}
        </Alert>

        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            {t('domainDocs.glossaryTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              <li>{t('domainDocs.glossaryDomain')}</li>
              <li>{t('domainDocs.glossaryRegistrar')}</li>
              <li>{t('domainDocs.glossaryDns')}</li>
              <li>{t('domainDocs.glossarySubdomain')}</li>
            </ul>
          </Typography>
        </Paper>

        <Accordion defaultExpanded disableGutters sx={{ bgcolor: 'background.paper', mb: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={700}>{t('domainDocs.buyTitle')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.buyIntro')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.whereBuy')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.whereBuyBody')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.typicalFlow')}
            </Typography>
            <Typography variant="body2" color="text.secondary" component="div">
              <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>{t('domainDocs.typicalFlowL1')}</li>
                <li>{t('domainDocs.typicalFlowL2')}</li>
                <li>{t('domainDocs.typicalFlowL3')}</li>
                <li>{t('domainDocs.typicalFlowL4')}</li>
                <li>{t('domainDocs.typicalFlowL5')}</li>
              </ol>
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.costsTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.costsBody')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.privacyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('domainDocs.privacyBody')}
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.paper', mb: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={700}>{t('domainDocs.dnsTitle')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.dnsAfterHosting')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.cnameTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.cnameBody')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.txtTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.txtBody')}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {t('domainDocs.propTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('domainDocs.propBody')}
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.paper', mb: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={700}>{t('domainDocs.connectTitle')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" component="div">
              <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>{t('domainDocs.connectL1')}</li>
                <li>{t('domainDocs.connectL2')}</li>
                <li>{t('domainDocs.connectL3')}</li>
                <li>{t('domainDocs.connectL4')}</li>
              </ol>
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t('domainDocs.apexWarn')}
            </Alert>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.paper', mb: 3, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={700}>{t('domainDocs.httpsTitle')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('domainDocs.httpsBody')}
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Button variant="contained" onClick={() => navigate(-1)} fullWidth sx={{ py: 1.5 }}>
          {t('domainDocs.continueApp')}
        </Button>
      </Box>
    </Box>
  );
}
