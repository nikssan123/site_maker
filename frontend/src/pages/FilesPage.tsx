import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AppBar,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CodeIcon from '@mui/icons-material/Code';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ImageIcon from '@mui/icons-material/Image';
import ArticleIcon from '@mui/icons-material/Article';
import LanguageIcon from '@mui/icons-material/Language';
import PaletteIcon from '@mui/icons-material/Palette';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import Editor from '@monaco-editor/react';
import { api } from '../lib/api';

type FsNode =
  | { type: 'dir'; name: string; path: string; children: FsNode[] }
  | { type: 'file'; name: string; path: string; size: number };

function extToLanguage(p: string): string {
  const name = p.toLowerCase();
  if (name.endsWith('.ts')) return 'typescript';
  if (name.endsWith('.tsx')) return 'typescript';
  if (name.endsWith('.js')) return 'javascript';
  if (name.endsWith('.jsx')) return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
  if (name.endsWith('.prisma')) return 'prisma';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.env')) return 'dotenv';
  return 'plaintext';
}

function fileIconFor(pathLike: string): React.ReactNode {
  const p = pathLike.toLowerCase();
  const base = p.split('/').pop() ?? p;
  if (base === '.env' || base.endsWith('.env')) return <SettingsIcon sx={{ fontSize: 18 }} />;

  if (/\.(png|jpe?g|gif|svg|webp|ico|avif)$/.test(p)) return <ImageIcon sx={{ fontSize: 18 }} />;
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p)) return <CodeIcon sx={{ fontSize: 18 }} />;
  if (/\.(json|yml|yaml)$/.test(p)) return <DataObjectIcon sx={{ fontSize: 18 }} />;
  if (/\.(md|mdx|txt)$/.test(p)) return <ArticleIcon sx={{ fontSize: 18 }} />;
  if (/\.(html)$/.test(p)) return <LanguageIcon sx={{ fontSize: 18 }} />;
  if (/\.(css|scss|sass|less)$/.test(p)) return <PaletteIcon sx={{ fontSize: 18 }} />;
  if (/\.(prisma|sql|db)$/.test(p)) return <StorageIcon sx={{ fontSize: 18 }} />;
  return <InsertDriveFileIcon sx={{ fontSize: 18 }} />;
}

function parentDir(p: string): string {
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

function joinPath(dir: string, name: string): string {
  const d = (dir ?? '').replace(/\/+$/g, '');
  const n = (name ?? '').replace(/^\/+/g, '');
  return d ? `${d}/${n}` : n;
}

function flattenTree(nodes: FsNode[], acc: FsNode[] = []): FsNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.type === 'dir') flattenTree(n.children ?? [], acc);
  }
  return acc;
}

export default function FilesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [tree, setTree] = useState<FsNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedEncoding, setSelectedEncoding] = useState<'utf8' | 'binary' | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<null | { dataUrl: string; mime?: string }>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [confirmServerAck, setConfirmServerAck] = useState(false);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptHint, setPromptHint] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState<null | ((value: string) => Promise<void>)>(null);

  const isServerJs = useMemo(() => {
    const p = (selectedPath ?? '').toLowerCase();
    return p === 'server.js' || p.endsWith('/server.js');
  }, [selectedPath]);

  const reloadTree = useCallback(async () => {
    if (!projectId) return;
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await api.fsTree(projectId);
      setTree(res.children as FsNode[]);
    } catch (e: any) {
      setTreeError(e.message ?? 'Failed to load file tree');
    } finally {
      setLoadingTree(false);
    }
  }, [projectId]);

  useEffect(() => {
    reloadTree();
  }, [reloadTree]);

  const openFile = useCallback(async (p: string) => {
    if (!projectId) return;
    if (dirty && selectedPath && selectedPath !== p) {
      const ok = window.confirm('Имаш незапазени промени. Да продължа ли и да ги загубя?');
      if (!ok) return;
    }

    setSelectedPath(p);
    setSelectedEncoding(null);
    setSelectedSize(null);
    setSelectedImagePreview(null);
    setContent('');
    setDirty(false);
    setConfirmServerAck(false);

    try {
      const res = await api.fsReadFile(projectId, p);
      setSelectedEncoding(res.encoding);
      setSelectedSize(res.size);
      if (res.encoding === 'binary' && res.kind === 'image' && typeof res.dataUrl === 'string') {
        setSelectedImagePreview({ dataUrl: res.dataUrl, mime: res.mime });
      }
      setContent(res.encoding === 'utf8' ? (res.content ?? '') : '');
    } catch (e: any) {
      setErrorToast(e.message ?? 'Неуспешно отваряне на файл');
    }
  }, [projectId, dirty, selectedPath]);

  const saveFile = useCallback(async () => {
    if (!projectId || !selectedPath) return;
    if (selectedEncoding === 'binary') {
      setErrorToast('Този файл не може да бъде редактиран тук (binary).');
      return;
    }
    if (isServerJs && !confirmServerAck) {
      setErrorToast('server.js е high risk. Потвърди предупреждението, за да запазиш.');
      return;
    }

    setSaving(true);
    try {
      await api.fsWriteFile(projectId, {
        path: selectedPath,
        content,
        highRiskAck: isServerJs ? true : undefined,
      });
      setDirty(false);
      setToast('Запазено. Рестартирам preview…');
      await reloadTree();
    } catch (e: any) {
      setErrorToast(e.message ?? 'Грешка при запазване');
    } finally {
      setSaving(false);
    }
  }, [projectId, selectedPath, content, selectedEncoding, isServerJs, confirmServerAck, reloadTree]);

  const allNodes = useMemo(() => flattenTree(tree), [tree]);
  const selectedNode = useMemo(() => allNodes.find((n) => n.path === selectedPath) ?? null, [allNodes, selectedPath]);

  const openPrompt = useCallback((opts: {
    title: string;
    hint?: string;
    initial?: string;
    action: (value: string) => Promise<void>;
  }) => {
    setPromptTitle(opts.title);
    setPromptHint(opts.hint ?? null);
    setPromptValue(opts.initial ?? '');
    setPromptAction(() => opts.action);
    setPromptOpen(true);
  }, []);

  const runPrompt = useCallback(async () => {
    if (!promptAction) return;
    const value = promptValue.trim();
    if (!value) return;
    setPromptOpen(false);
    try {
      await promptAction(value);
      await reloadTree();
    } catch (e: any) {
      setErrorToast(e.message ?? 'Операцията не успя');
    } finally {
      setPromptAction(null);
      setPromptValue('');
      setPromptHint(null);
    }
  }, [promptAction, promptValue, reloadTree]);

  const createFile = useCallback(() => {
    if (!projectId) return;
    openPrompt({
      title: 'Нов файл',
      hint: 'Пример: src/pages/Home.tsx',
      action: async (value) => {
        await api.fsWriteFile(projectId, { path: value, content: '' });
        setToast('Файлът е създаден. Рестартирам preview…');
        await openFile(value);
      },
    });
  }, [projectId, openPrompt, openFile]);

  const createFolder = useCallback(() => {
    if (!projectId) return;
    openPrompt({
      title: 'Нова папка',
      hint: 'Пример: src/components',
      action: async (value) => {
        await api.fsMkdir(projectId, value);
        setToast('Папката е създадена. Рестартирам preview…');
      },
    });
  }, [projectId, openPrompt]);

  const renameSelected = useCallback(() => {
    if (!projectId || !selectedNode) return;
    openPrompt({
      title: 'Преименувай',
      hint: `Нов път (пример: ${selectedNode.type === 'dir' ? 'src/new-folder' : 'src/new-file.tsx'})`,
      initial: selectedNode.path,
      action: async (value) => {
        await api.fsRename(projectId, selectedNode.path, value);
        setToast('Преименувано. Рестартирам preview…');
        if (selectedNode.type === 'file') {
          setSelectedPath(value);
        } else {
          setSelectedPath(null);
          setContent('');
          setDirty(false);
        }
      },
    });
  }, [projectId, selectedNode, openPrompt]);

  const deleteSelected = useCallback(async () => {
    if (!projectId || !selectedNode) return;
    const ok = window.confirm(
      selectedNode.type === 'dir'
        ? 'Да изтрия ли тази папка? Ако не е празна, ще изтрие всичко в нея.'
        : 'Да изтрия ли този файл?',
    );
    if (!ok) return;
    try {
      await api.fsDelete(projectId, selectedNode.path, { recursive: selectedNode.type === 'dir' });
      setToast('Изтрито. Рестартирам preview…');
      if (selectedNode.type === 'file') {
        setSelectedPath(null);
        setSelectedEncoding(null);
        setSelectedSize(null);
        setContent('');
        setDirty(false);
      }
      await reloadTree();
    } catch (e: any) {
      setErrorToast(e.message ?? 'Неуспешно изтриване');
    }
  }, [projectId, selectedNode, reloadTree]);

  const breadcrumbs = useMemo(() => {
    if (!selectedPath) return [];
    const parts = selectedPath.split('/').filter(Boolean);
    const crumbs: Array<{ label: string; path: string }> = [];
    let cur = '';
    for (const part of parts) {
      cur = joinPath(cur, part);
      crumbs.push({ label: part, path: cur });
    }
    return crumbs;
  }, [selectedPath]);

  if (!projectId) return null;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: '48px !important', gap: 1 }}>
          <IconButton size="small" onClick={() => navigate(`/preview/${projectId}`)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={800} sx={{ flex: 1 }}>
            Файлове
          </Typography>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => reloadTree()}
            disabled={loadingTree || saving}
          >
            Обнови
          </Button>
          <Button
            size="small"
            startIcon={<SaveIcon />}
            variant="contained"
            onClick={saveFile}
            disabled={!selectedPath || saving || !dirty || selectedEncoding === 'binary'}
          >
            Запази
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left tree */}
        <Box sx={{ width: 340, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ p: 1.25, display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<NoteAddIcon />} onClick={createFile} fullWidth>
              Нов файл
            </Button>
            <Button size="small" startIcon={<CreateNewFolderIcon />} onClick={createFolder} fullWidth>
              Нова папка
            </Button>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {loadingTree ? (
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={22} /></Box>
            ) : treeError ? (
              <Box sx={{ p: 2 }}>
                <Alert severity="error">{treeError}</Alert>
              </Box>
            ) : (
              <List dense disablePadding>
                <TreeList nodes={tree} selectedPath={selectedPath} onOpenFile={openFile} onSelect={setSelectedPath} />
              </List>
            )}
          </Box>

          <Divider />
          <Box sx={{ p: 1.25, display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<DriveFileRenameOutlineIcon />}
              onClick={renameSelected}
              disabled={!selectedNode}
              fullWidth
            >
              Rename
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={deleteSelected}
              disabled={!selectedNode}
              fullWidth
            >
              Delete
            </Button>
          </Box>
        </Box>

        {/* Editor */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 28, flexWrap: 'wrap' }}>
              {selectedPath ? (
                <>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                    {selectedPath}
                  </Typography>
                  {typeof selectedSize === 'number' && (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      ({Math.round(selectedSize / 1024)} KB)
                    </Typography>
                  )}
                  {dirty && (
                    <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 800 }}>
                      • незапазено
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Избери файл отляво.
                </Typography>
              )}
            </Stack>
          </Box>

          {isServerJs && selectedEncoding !== 'binary' && selectedPath ? (
            <Box sx={{ px: 2, py: 1.25 }}>
              <Alert
                icon={<WarningAmberIcon />}
                severity={confirmServerAck ? 'warning' : 'error'}
                action={(
                  <Button
                    size="small"
                    color="inherit"
                    variant={confirmServerAck ? 'outlined' : 'contained'}
                    onClick={() => setConfirmServerAck((v) => !v)}
                    sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
                  >
                    {confirmServerAck ? 'Откажи' : 'Разбирам риска'}
                  </Button>
                )}
              >
                Редакцията на <b>server.js</b> е high risk и може да счупи preview/бекенда. Потвърди „Разбирам риска“ преди Save.
              </Alert>
            </Box>
          ) : null}

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {selectedPath && selectedEncoding === 'binary' && selectedImagePreview?.dataUrl ? (
              <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
                <Box
                  component="img"
                  src={selectedImagePreview.dataUrl}
                  alt={selectedPath}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 180px)',
                    display: 'block',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                />
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  Preview only. За редакция на изображение – качи нов файл или замени URL от контент.
                </Typography>
              </Box>
            ) : selectedPath && selectedEncoding === 'binary' ? (
              <Box sx={{ p: 2 }}>
                <Alert severity="info">Този файл изглежда бинарен и не може да бъде редактиран тук.</Alert>
              </Box>
            ) : selectedPath ? (
              <Editor
                height="100%"
                language={extToLanguage(selectedPath)}
                theme="vs-dark"
                value={content}
                onChange={(v) => {
                  setContent(v ?? '');
                  setDirty(true);
                }}
                options={{
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                }}
              />
            ) : (
              <Box sx={{ p: 3, color: 'text.secondary' }}>
                <Typography variant="body2">
                  Тук можеш да редактираш файловете директно. След Save системата ще rebuild-не и рестартира preview.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Dialog open={promptOpen} onClose={() => setPromptOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={900}>{promptTitle}</DialogTitle>
        <DialogContent>
          {promptHint && <Typography variant="caption" color="text.secondary" display="block" mb={1.25}>{promptHint}</Typography>}
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runPrompt().catch(() => {});
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromptOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => runPrompt().catch(() => {})}>OK</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast != null} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setToast(null)} sx={{ maxWidth: 560 }}>
          {toast}
        </Alert>
      </Snackbar>

      <Snackbar open={errorToast != null} autoHideDuration={9000} onClose={() => setErrorToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setErrorToast(null)} sx={{ maxWidth: 700 }}>
          {errorToast}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function TreeList(props: {
  nodes: FsNode[];
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  onSelect: (path: string) => void;
  level?: number;
}) {
  const level = props.level ?? 0;
  return (
    <>
      {props.nodes.map((n) => {
        const selected = props.selectedPath === n.path;
        return (
          <Box key={`${n.type}:${n.path}`}>
            <ListItemButton
              selected={selected}
              sx={{ pl: 1 + level * 2 }}
              onClick={() => {
                if (n.type === 'file') props.onOpenFile(n.path);
                else props.onSelect(n.path);
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {n.type === 'dir' ? <FolderIcon sx={{ fontSize: 18 }} /> : fileIconFor(n.path)}
              </ListItemIcon>
              <ListItemText
                primary={n.name}
                primaryTypographyProps={{ variant: 'body2', sx: { fontSize: 12.5 } }}
              />
            </ListItemButton>
            {n.type === 'dir' && n.children?.length ? (
              <TreeList
                nodes={n.children}
                selectedPath={props.selectedPath}
                onOpenFile={props.onOpenFile}
                onSelect={props.onSelect}
                level={level + 1}
              />
            ) : null}
          </Box>
        );
      })}
    </>
  );
}

