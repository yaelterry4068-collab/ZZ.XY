const { app, BrowserWindow, Menu, Tray, clipboard, globalShortcut, ipcMain, nativeImage, screen, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const APP_NAME = '沾沾';
const LEGACY_APP_NAME = '粘贴板工具';
const APP_ID = 'com.jackson.clipboardtool';
const DEFAULT_CUSTOM_SHORTCUT = 'Ctrl+Alt+V';
const DEFAULT_SETTINGS = {
  maxHistory: 500,
  recordImages: true,
  shortcutMode: 'doubleZ',
  customShortcut: DEFAULT_CUSTOM_SHORTCUT,
  theme: 'lime',
  settingsVersion: 4,
  firstLaunchShown: false
};
const POLL_INTERVAL_MS = 800;
const TEXT_PREVIEW_LIMIT = 120;
const ALT_SPACE_SHORTCUT = 'Alt+Space';
const CURRENT_SETTINGS_VERSION = 4;
const WINDOW_SAFE_MARGIN = 52;
const PANEL_WIDTH = 900;
const PANEL_HEIGHT = 640;
const SHORTCUT_LABELS = {
  doubleZ: 'ZZ',
  altSpace: 'Alt+Space',
  custom: DEFAULT_CUSTOM_SHORTCUT
};
const AVAILABLE_THEMES = new Set(['lime', 'dark']);
const AVAILABLE_SHORTCUT_MODES = new Set(Object.keys(SHORTCUT_LABELS));

let mainWindow;
let imageViewerWindow;
let imageViewerItemId = '';
let tray;
let pollTimer;
let isQuitting = false;
let isPaused = false;
let lastSignature = '';
let store;
let keyboardListener;
let pendingShowMainWindow = false;
let shortcutRegistration = {
  registered: true,
  accelerator: '',
  error: ''
};

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function migrateLegacyData(paths) {
  if (fs.existsSync(paths.historyPath) || !fs.existsSync(paths.legacyDataDir)) {
    return;
  }

  try {
    fs.cpSync(paths.legacyDataDir, paths.dataDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  } catch (error) {
    console.error('Failed to migrate legacy data:', error);
  }
}

function getDataPaths() {
  const dataDir = path.join(app.getPath('userData'), 'clipboard-data');
  const imagesDir = path.join(dataDir, 'images');
  const legacyDataDir = path.join(app.getPath('appData'), LEGACY_APP_NAME, 'clipboard-data');
  const legacyImagesDir = path.join(legacyDataDir, 'images');
  ensureDir(imagesDir);

  const paths = {
    dataDir,
    imagesDir,
    legacyDataDir,
    legacyImagesDir,
    historyPath: path.join(dataDir, 'history.json'),
    settingsPath: path.join(dataDir, 'settings.json')
  };

  migrateLegacyData(paths);
  return paths;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('Failed to read JSON:', error);
    try {
      const backupPath = `${filePath}.broken-${Date.now()}.bak`;
      fs.copyFileSync(filePath, backupPath);
    } catch (backupError) {
      console.error('Failed to back up broken JSON:', backupError);
    }
    return fallback;
  }
}

function writeJson(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function migrateLegacyImagePaths(history, paths) {
  if (!Array.isArray(history)) {
    return { history: [], changed: false };
  }

  const legacyImagesDir = path.normalize(paths.legacyImagesDir);
  let changed = false;
  const migrated = history.map((item) => {
    if (item?.type !== 'image' || !item.path) {
      return item;
    }

    const itemPath = path.normalize(item.path);
    if (!itemPath.startsWith(legacyImagesDir)) {
      return item;
    }

    const nextPath = path.join(paths.imagesDir, path.basename(item.path));
    if (!fs.existsSync(nextPath)) {
      return item;
    }

    changed = true;
    return {
      ...item,
      path: nextPath
    };
  });

  return { history: migrated, changed };
}

function createStore() {
  const paths = getDataPaths();
  const historyMigration = migrateLegacyImagePaths(readJson(paths.historyPath, []), paths);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...readJson(paths.settingsPath, {})
  };
  let settingsChanged = !fs.existsSync(paths.settingsPath);

  if (settings.settingsVersion !== CURRENT_SETTINGS_VERSION) {
    if (['doubleTab', 'ctrlAltV'].includes(settings.shortcutMode)) {
      settings.shortcutMode = DEFAULT_SETTINGS.shortcutMode;
    }
    if (!settings.customShortcut) {
      settings.customShortcut = DEFAULT_CUSTOM_SHORTCUT;
    }
    settings.settingsVersion = CURRENT_SETTINGS_VERSION;
    settingsChanged = true;
  }
  if (!AVAILABLE_SHORTCUT_MODES.has(settings.shortcutMode)) {
    settings.shortcutMode = DEFAULT_SETTINGS.shortcutMode;
    settingsChanged = true;
  }
  if (!AVAILABLE_THEMES.has(settings.theme)) {
    settings.theme = DEFAULT_SETTINGS.theme;
    settingsChanged = true;
  }
  if (historyMigration.changed) {
    writeJson(paths.historyPath, historyMigration.history);
  }
  if (settingsChanged) {
    writeJson(paths.settingsPath, settings);
  }

  return {
    ...paths,
    history: historyMigration.history,
    settings
  };
}

function persistHistory() {
  writeJson(store.historyPath, store.history);
}

function persistSettings() {
  writeJson(store.settingsPath, store.settings);
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function removeImageIfUnused(item) {
  if (item?.type !== 'image' || !item.path || !fileExists(item.path)) {
    return;
  }

  const stillUsed = store.history.some((entry) => entry.id !== item.id && entry.path === item.path);
  if (!stillUsed) {
    fs.unlinkSync(item.path);
  }
}

function trimHistory() {
  while (store.history.length > store.settings.maxHistory) {
    const removed = store.history.pop();
    removeImageIfUnused(removed);
  }
}

function createTextItem(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const signature = `text:${hash(normalized)}`;

  return {
    id: crypto.randomUUID(),
    type: 'text',
    text: normalized,
    preview: normalized.slice(0, TEXT_PREVIEW_LIMIT),
    signature,
    createdAt: new Date().toISOString()
  };
}

function createImageItem(image, png = image.toPNG(), signature = `image:${hash(png)}`) {
  const fileName = `${Date.now()}-${crypto.randomUUID()}.png`;
  const imagePath = path.join(store.imagesDir, fileName);
  fs.writeFileSync(imagePath, png);

  const size = image.getSize();
  return {
    id: crypto.randomUUID(),
    type: 'image',
    path: imagePath,
    width: size.width,
    height: size.height,
    signature,
    createdAt: new Date().toISOString()
  };
}

function promoteExistingHistoryItem(signature) {
  const existingIndex = store.history.findIndex((entry) => entry.signature === signature);
  if (existingIndex < 0) {
    return false;
  }

  const [existing] = store.history.splice(existingIndex, 1);
  store.history.unshift({
    ...existing,
    createdAt: new Date().toISOString()
  });
  lastSignature = signature;
  persistHistory();
  sendHistory();
  return true;
}

function addHistoryItem(item) {
  if (!item || item.signature === lastSignature) {
    removeImageIfUnused(item);
    return;
  }

  const existingIndex = store.history.findIndex((entry) => entry.signature === item.signature);
  if (existingIndex >= 0) {
    const [existing] = store.history.splice(existingIndex, 1);
    if (item.type === 'image' && item.path !== existing.path) {
      removeImageIfUnused(item);
    }

    store.history.unshift({
      ...existing,
      createdAt: new Date().toISOString()
    });
  } else {
    store.history.unshift(item);
  }

  lastSignature = item.signature;
  trimHistory();
  persistHistory();
  sendHistory();
}

function captureClipboard() {
  if (isPaused || !store) {
    return;
  }

  try {
    const text = clipboard.readText();
    if (text && text.trim()) {
      addHistoryItem(createTextItem(text));
      return;
    }

    const image = clipboard.readImage();
    if (store.settings.recordImages && !image.isEmpty()) {
      const png = image.toPNG();
      const signature = `image:${hash(png)}`;
      if (signature === lastSignature || promoteExistingHistoryItem(signature)) {
        return;
      }

      addHistoryItem(createImageItem(image, png, signature));
    }
  } catch (error) {
    console.error('Failed to capture clipboard:', error);
  }
}

function getPublicHistory() {
  return store.history.map((item) => ({
    id: item.id,
    type: item.type,
    text: item.type === 'text' ? item.text : '',
    preview: item.preview || '',
    imageSrc: item.type === 'image' && fileExists(item.path) ? pathToFileURL(item.path).href : '',
    width: item.width || 0,
    height: item.height || 0,
    createdAt: item.createdAt
  }));
}

function getPublicImageItems() {
  return store.history
    .filter((item) => item.type === 'image' && fileExists(item.path))
    .map((item) => ({
      id: item.id,
      imageSrc: pathToFileURL(item.path).href,
      width: item.width || 0,
      height: item.height || 0,
      createdAt: item.createdAt
    }));
}

function getImageViewerPayload(id) {
  const images = getPublicImageItems();
  const index = Math.max(0, images.findIndex((item) => item.id === id));
  const item = images[index] || images[0] || null;

  return {
    item,
    index: item ? index : -1,
    count: images.length
  };
}

function sendHistory() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history:updated', getPublicHistory());
  }
}

function getShortcutLabel() {
  if (store.settings.shortcutMode === 'custom') {
    return normalizeShortcut(store.settings.customShortcut) || DEFAULT_CUSTOM_SHORTCUT;
  }

  return SHORTCUT_LABELS[store.settings.shortcutMode] || SHORTCUT_LABELS.doubleZ;
}

function getImageBytes() {
  return store.history.reduce((total, item) => {
    if (item.type !== 'image' || !fileExists(item.path)) {
      return total;
    }

    try {
      return total + fs.statSync(item.path).size;
    } catch {
      return total;
    }
  }, 0);
}

function getStats() {
  const imageCount = store.history.filter((item) => item.type === 'image').length;
  return {
    count: store.history.length,
    textCount: store.history.length - imageCount,
    imageCount,
    imageBytes: getImageBytes(),
    dataDir: store.dataDir
  };
}

function focusSearchInput() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:focus-search');
  }
}

function normalizeShortcut(value) {
  const rawParts = String(value || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set();
  let key = '';

  rawParts.forEach((part) => {
    const lower = part.toLowerCase();
    if (['ctrl', 'control'].includes(lower)) {
      modifiers.add('Ctrl');
    } else if (['alt', 'option'].includes(lower)) {
      modifiers.add('Alt');
    } else if (lower === 'shift') {
      modifiers.add('Shift');
    } else if (['meta', 'super', 'win', 'windows', 'cmd', 'command'].includes(lower)) {
      modifiers.add('Super');
    } else if (!key) {
      key = part;
    }
  });

  const keyMap = {
    ' ': 'Space',
    space: 'Space',
    esc: 'Esc',
    escape: 'Esc',
    enter: 'Enter',
    return: 'Enter',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    insert: 'Insert',
    ins: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right'
  };

  const lowerKey = key.toLowerCase();
  if (keyMap[lowerKey]) {
    key = keyMap[lowerKey];
  } else if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    key = key.toUpperCase();
  } else if (/^[a-z0-9]$/i.test(key)) {
    key = key.toUpperCase();
  } else {
    return '';
  }

  if (!modifiers.size && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return '';
  }

  return ['Ctrl', 'Alt', 'Shift', 'Super']
    .filter((modifier) => modifiers.has(modifier))
    .concat(key)
    .join('+');
}

function getShortcutAccelerator() {
  if (store.settings.shortcutMode === 'altSpace') {
    return ALT_SPACE_SHORTCUT;
  }

  if (store.settings.shortcutMode === 'custom') {
    return normalizeShortcut(store.settings.customShortcut) || DEFAULT_CUSTOM_SHORTCUT;
  }

  return '';
}

function setClipboardItem(id) {
  const item = store.history.find((entry) => entry.id === id);
  if (!item) {
    return false;
  }

  if (item.type === 'text') {
    clipboard.writeText(item.text);
  } else if (item.type === 'image' && fileExists(item.path)) {
    clipboard.writeImage(nativeImage.createFromPath(item.path));
  } else {
    return false;
  }

  lastSignature = item.signature;
  return true;
}

function deleteHistoryItem(id) {
  const index = store.history.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return false;
  }

  const [removed] = store.history.splice(index, 1);
  removeImageIfUnused(removed);
  persistHistory();
  sendHistory();
  return true;
}

function clearHistory() {
  const removedItems = [...store.history];
  store.history = [];
  removedItems.forEach(removeImageIfUnused);
  persistHistory();
  sendHistory();
}

function createTrayImage() {
  const iconPath = path.join(__dirname, '..', 'assets', 'app-icon.png');
  if (fileExists(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }

  return nativeImage.createEmpty();
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: `打开沾沾 (${getShortcutLabel()})`,
      click: showMainWindow
    },
    {
        label: isPaused ? '继续监听' : '暂停监听',
      click: () => {
        isPaused = !isPaused;
        updateTrayMenu();
        sendHistory();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(isPaused ? '沾沾 - 已暂停' : '沾沾');
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.on('click', showMainWindow);
  updateTrayMenu();
}

function showStartupNotification() {
  const title = '\u6cbe\u6cbe\u5df2\u542f\u52a8';
  const body = `\u6b63\u5728\u540e\u53f0\u8bb0\u5f55\u526a\u8d34\u677f\uff0c\u6309 ${getShortcutLabel()} \u547c\u51fa\u3002`;
  const iconPath = path.join(__dirname, '..', 'assets', 'app-icon.png');

  if (tray && process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
    tray.once('balloon-click', showMainWindow);
    tray.displayBalloon({
      title,
      content: body,
      icon: createTrayImage(),
      noSound: true
    });
    return;
  }

  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: fileExists(iconPath) ? iconPath : undefined,
        silent: true
      });
      notification.on('click', showMainWindow);
      notification.show();
      return;
    }
  } catch (error) {
    console.error('Failed to show startup notification:', error);
  }
}

function createMainWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'app-icon.png');
  mainWindow = new BrowserWindow({
    width: PANEL_WIDTH + WINDOW_SAFE_MARGIN * 2,
    height: PANEL_HEIGHT + WINDOW_SAFE_MARGIN * 2,
    minWidth: 760 + WINDOW_SAFE_MARGIN * 2,
    minHeight: 520 + WINDOW_SAFE_MARGIN * 2,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    title: '沾沾',
    icon: fileExists(iconPath) ? iconPath : undefined,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('did-finish-load', sendHistory);
}

function showMainWindow() {
  if (!store) {
    pendingShowMainWindow = true;
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  mainWindow.center();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.focus();
    }
  }, 180);
  sendHistory();
  focusSearchInput();
}

function requestShowMainWindow() {
  if (!app.isReady() || !store) {
    pendingShowMainWindow = true;
    return;
  }

  showMainWindow();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function sendImageViewerPayload() {
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.webContents.send('image-viewer:data', getImageViewerPayload(imageViewerItemId));
  }
}

function createImageViewerWindow(id) {
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const payload = getImageViewerPayload(id);
  const item = payload.item;
  const imageWidth = item?.width || 1100;
  const imageHeight = item?.height || 760;
  const viewerWidth = Math.min(Math.max(imageWidth + 96, 860), Math.floor(workWidth * 0.92));
  const viewerHeight = Math.min(Math.max(imageHeight + 148, 620), Math.floor(workHeight * 0.9));
  const iconPath = path.join(__dirname, '..', 'assets', 'app-icon.png');

  imageViewerWindow = new BrowserWindow({
    width: viewerWidth,
    height: viewerHeight,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: '查看图片',
    icon: fileExists(iconPath) ? iconPath : undefined,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  imageViewerWindow.loadFile(path.join(__dirname, 'renderer', 'image-viewer.html'));
  imageViewerWindow.setMenuBarVisibility(false);
  imageViewerWindow.webContents.on('did-finish-load', sendImageViewerPayload);
  imageViewerWindow.on('closed', () => {
    imageViewerWindow = null;
    imageViewerItemId = '';
  });
}

function openImageViewer(id) {
  const payload = getImageViewerPayload(id);
  if (!payload.item) {
    return false;
  }

  imageViewerItemId = payload.item.id;
  if (!imageViewerWindow || imageViewerWindow.isDestroyed()) {
    createImageViewerWindow(imageViewerItemId);
  }

  imageViewerWindow.center();
  imageViewerWindow.show();
  imageViewerWindow.focus();
  sendImageViewerPayload();
  return true;
}

function moveImageViewer(offset) {
  const images = getPublicImageItems();
  if (!images.length) {
    return getImageViewerPayload(imageViewerItemId);
  }

  const currentIndex = Math.max(0, images.findIndex((item) => item.id === imageViewerItemId));
  const nextIndex = (currentIndex + offset + images.length) % images.length;
  imageViewerItemId = images[nextIndex].id;
  sendImageViewerPayload();
  return getImageViewerPayload(imageViewerItemId);
}

function registerIpc() {
  ipcMain.handle('history:list', () => getPublicHistory());
  ipcMain.handle('history:copy', (_event, id) => setClipboardItem(id));
  ipcMain.handle('history:delete', (_event, id) => deleteHistoryItem(id));
  ipcMain.handle('history:clear', () => {
    clearHistory();
    return true;
  });
  ipcMain.handle('app:hide', () => {
    hideMainWindow();
    return true;
  });
  ipcMain.handle('app:status', () => ({
    isPaused,
    maxHistory: store.settings.maxHistory,
    count: store.history.length,
    shortcut: getShortcutLabel(),
    shortcutRegistration,
    settings: store.settings,
    stats: getStats()
  }));
  ipcMain.handle('app:update-settings', (_event, settings) => updateSettings(settings));
  ipcMain.handle('image-viewer:open', (_event, id) => openImageViewer(id));
  ipcMain.handle('image-viewer:move', (_event, offset) => moveImageViewer(offset));
  ipcMain.handle('image-viewer:copy', () => setClipboardItem(imageViewerItemId));
  ipcMain.handle('image-viewer:close', () => {
    if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
      imageViewerWindow.close();
    }
    return true;
  });
  ipcMain.handle('app:dismiss-first-launch', () => {
    store.settings.firstLaunchShown = true;
    persistSettings();
    return store.settings;
  });
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  shortcutRegistration = {
    registered: true,
    accelerator: '',
    error: ''
  };

  const accelerator = getShortcutAccelerator();
  if (!accelerator) {
    return;
  }

  const registered = globalShortcut.register(accelerator, showMainWindow);
  shortcutRegistration = {
    registered,
    accelerator,
    error: registered ? '' : '快捷键被占用或系统不支持'
  };
  if (!registered) {
    console.error(`Failed to register shortcut: ${accelerator}`);
  }
}

function stopDoubleZListener() {
  if (keyboardListener) {
    keyboardListener.kill();
    keyboardListener = null;
  }
}

function startDoubleZListener() {
  stopDoubleZListener();
  if (store.settings.shortcutMode !== 'doubleZ') {
    return;
  }

  const listenerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'double-tab-listener.ps1')
    : path.join(__dirname, 'double-tab-listener.ps1');
  if (!fs.existsSync(listenerPath)) {
    console.error(`Double Z listener not found: ${listenerPath}`);
    return;
  }

  keyboardListener = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    listenerPath
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  keyboardListener.stdout.on('data', (data) => {
    const messages = data.toString('utf8').split(/\r?\n/).map((line) => line.trim());
    if (messages.includes('DOUBLE_Z')) {
      showMainWindow();
    }
  });

  keyboardListener.stderr.on('data', (data) => {
    console.error(`Double Z listener error: ${data.toString('utf8')}`);
  });

  keyboardListener.on('exit', (code) => {
    if (!isQuitting) {
      console.error(`Double Z listener exited: ${code}`);
      keyboardListener = null;
    }
  });
}

function applyShortcutSettings() {
  registerGlobalShortcuts();
  startDoubleZListener();
  updateTrayMenu();
}

function updateSettings(settings) {
  const previousShortcutMode = store.settings.shortcutMode;
  const previousCustomShortcut = store.settings.customShortcut || DEFAULT_CUSTOM_SHORTCUT;
  const nextSettings = {
    ...store.settings,
    ...settings
  };

  nextSettings.maxHistory = Math.min(Math.max(Number(nextSettings.maxHistory) || DEFAULT_SETTINGS.maxHistory, 100), 2000);
  nextSettings.recordImages = Boolean(nextSettings.recordImages);
  nextSettings.customShortcut = normalizeShortcut(nextSettings.customShortcut) || previousCustomShortcut;
  if (!AVAILABLE_THEMES.has(nextSettings.theme)) {
    nextSettings.theme = DEFAULT_SETTINGS.theme;
  }
  nextSettings.settingsVersion = CURRENT_SETTINGS_VERSION;
  if (!AVAILABLE_SHORTCUT_MODES.has(nextSettings.shortcutMode)) {
    nextSettings.shortcutMode = DEFAULT_SETTINGS.shortcutMode;
  }

  const shortcutChanged = nextSettings.shortcutMode !== store.settings.shortcutMode ||
    nextSettings.customShortcut !== store.settings.customShortcut;
  store.settings = nextSettings;
  trimHistory();
  persistHistory();
  persistSettings();

  if (shortcutChanged) {
    applyShortcutSettings();
    if (!shortcutRegistration.registered) {
      store.settings.shortcutMode = previousShortcutMode;
      store.settings.customShortcut = previousCustomShortcut;
      persistSettings();
      applyShortcutSettings();
      sendHistory();
      return {
        settings: store.settings,
        stats: getStats(),
        shortcut: getShortcutLabel(),
        shortcutRegistered: false,
        shortcutError: '快捷键被占用或系统不支持，请换一个组合键'
      };
    }
  }

  sendHistory();
  return {
    settings: store.settings,
    stats: getStats(),
    shortcut: getShortcutLabel(),
    shortcutRegistered: true,
    shortcutError: ''
  };
}

function startPolling() {
  captureClipboard();
  pollTimer = setInterval(captureClipboard, POLL_INTERVAL_MS);
}

if (gotSingleInstanceLock) {
  app.on('second-instance', requestShowMainWindow);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    store = createStore();
    registerIpc();
    createMainWindow();
    createTray();
    applyShortcutSettings();
    startPolling();
    showStartupNotification();
    showMainWindow();

    if (pendingShowMainWindow) {
      pendingShowMainWindow = false;
      showMainWindow();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {});

  app.on('will-quit', () => {
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    if (keyboardListener) {
      keyboardListener.kill();
      keyboardListener = null;
    }
    globalShortcut.unregisterAll();
  });
}
