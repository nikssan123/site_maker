import { FormControl, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface Props {
  size?: 'small' | 'medium';
  minWidth?: number;
}

export default function LanguageSwitcher({ size = 'small', minWidth = 112 }: Props) {
  const { t, i18n } = useTranslation();

  return (
    <FormControl size={size} sx={{ minWidth }}>
      <Select
        value={i18n.language.startsWith('bg') ? 'bg' : 'en'}
        onChange={(e) => { void i18n.changeLanguage(String(e.target.value)); }}
        displayEmpty
        sx={{ '& .MuiSelect-select': { py: size === 'small' ? 0.75 : 1 } }}
      >
        <MenuItem value="bg">{t('common.languageBg')}</MenuItem>
        <MenuItem value="en">{t('common.languageEn')}</MenuItem>
      </Select>
    </FormControl>
  );
}
