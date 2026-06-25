const historyList = document.querySelector('#historyList');
const emptyState = document.querySelector('#emptyState');
const emptyTitle = document.querySelector('#emptyTitle');
const emptyDescription = document.querySelector('#emptyDescription');
const searchInput = document.querySelector('#searchInput');
const countText = document.querySelector('#countText');
const categoryBar = document.querySelector('#categoryBar');
const clearButton = document.querySelector('#clearButton');
const statusText = document.querySelector('#statusText');
const template = document.querySelector('#itemTemplate');
const appShell = document.querySelector('#appShell');
const themeButton = document.querySelector('#themeButton');
const settingsButton = document.querySelector('#settingsButton');
const firstTip = document.querySelector('#firstTip');
const firstTipButton = document.querySelector('#firstTipButton');
const imageModal = document.querySelector('#imageModal');
const imageModalImg = document.querySelector('#imageModalImg');
const imageModalMeta = document.querySelector('#imageModalMeta');
const imageModalClose = document.querySelector('#imageModalClose');
const imagePrevButton = document.querySelector('#imagePrevButton');
const imageNextButton = document.querySelector('#imageNextButton');
const imageCopyButton = document.querySelector('#imageCopyButton');
const settingsModal = document.querySelector('#settingsModal');
const settingsCloseButton = document.querySelector('#settingsCloseButton');
const shortcutControl = document.querySelector('#shortcutControl');
const shortcutHelp = document.querySelector('#shortcutHelp');
const customShortcutButton = document.querySelector('#customShortcutButton');
const shortcutActions = document.querySelector('#shortcutActions');
const shortcutConfirmButton = document.querySelector('#shortcutConfirmButton');
const shortcutCancelButton = document.querySelector('#shortcutCancelButton');
const maxHistoryInput = document.querySelector('#maxHistoryInput');
const recordImagesToggle = document.querySelector('#recordImagesToggle');
const settingsSaveButton = document.querySelector('#settingsSaveButton');
const settingsClearButton = document.querySelector('#settingsClearButton');
const summaryTotal = document.querySelector('#summaryTotal');
const summaryText = document.querySelector('#summaryText');
const summaryImages = document.querySelector('#summaryImages');
const summaryImageSize = document.querySelector('#summaryImageSize');
const summaryPath = document.querySelector('#summaryPath');
const confirmModal = document.querySelector('#confirmModal');
const confirmTitle = document.querySelector('#confirmTitle');
const confirmMessage = document.querySelector('#confirmMessage');
const confirmCancelButton = document.querySelector('#confirmCancelButton');
const confirmOkButton = document.querySelector('#confirmOkButton');
const toast = document.querySelector('#toast');

let historyItems = [];
let filteredItems = [];
let appStatus = null;
let selectedCategory = 'all';
let currentImageIndex = -1;
let selectedShortcutMode = 'doubleZ';
let selectedCustomShortcut = 'Ctrl+Alt+V';
let isRecordingShortcut = false;
let hasUnsavedShortcut = false;
let savedShortcutMode = 'doubleZ';
let savedCustomShortcut = 'Ctrl+Alt+V';
let selectedRecordImages = true;
let selectedTheme = 'lime';
let selectedIndex = 0;
let showKeyboardSelection = false;
let toastTimer;
let windowAnimationTimer;
let pendingListPositions = null;
let pendingConfirmResolve = null;
const LONG_TEXT_THRESHOLD = 120;
const CATEGORY_LABELS = {
  all: '全部',
  image: '图片',
  longText: '大段文案',
  credential: '账号密码',
  text: '文字'
};

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function matchesSearch(item, query) {
  if (!query) {
    return true;
  }

  if (item.type === 'image') {
    return '图片'.includes(query) || CATEGORY_LABELS.image.includes(query);
  }

  const category = getItemCategory(item);
  const categoryLabel = CATEGORY_LABELS[category] || '';
  return String(item.text || '').toLowerCase().includes(query) || categoryLabel.toLowerCase().includes(query);
}

function isCredentialText(text) {
  const value = String(text || '').trim();
  if (!value) {
    return false;
  }

  if (/(账号|秘密)/i.test(value)) {
    return true;
  }

  const hasPassword = /(密码|口令|password|passwd|pwd|passcode)\s*[:：= ]/i.test(value);
  const hasAccount = /(账号|账户|用户名|登录名|邮箱|手机号|account|username|user|login|email|phone)\s*[:：= ]/i.test(value);
  const compactPair = /(账号|账户|用户名|登录名|account|username|user|login|email|phone).{0,80}(密码|口令|password|passwd|pwd|passcode)/is.test(value) ||
    /(密码|口令|password|passwd|pwd|passcode).{0,80}(账号|账户|用户名|登录名|account|username|user|login|email|phone)/is.test(value);

  return (hasPassword && hasAccount) || compactPair;
}

function isLongText(item) {
  const text = String(item.text || item.preview || '');
  return text.length >= LONG_TEXT_THRESHOLD || text.split(/\r?\n/).filter(Boolean).length >= 4;
}

function getItemCategory(item) {
  if (item.type === 'image') {
    return 'image';
  }

  if (isCredentialText(item.text || item.preview)) {
    return 'credential';
  }

  if (isLongText(item)) {
    return 'longText';
  }

  return 'text';
}

function matchesCategory(item) {
  if (selectedCategory === 'all') {
    return true;
  }

  return getItemCategory(item) === selectedCategory;
}

function getCategoryCounts() {
  return historyItems.reduce((counts, item) => {
    counts.all += 1;
    const category = getItemCategory(item);
    if (counts[category] !== undefined) {
      counts[category] += 1;
    }
    return counts;
  }, {
    all: 0,
    image: 0,
    longText: 0,
    credential: 0
  });
}

function updateCategoryBar() {
  const counts = getCategoryCounts();
  categoryBar.querySelectorAll('button[data-category]').forEach((button) => {
    const category = button.dataset.category;
    const isActive = category === selectedCategory;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    const countNode = button.querySelector('span');
    if (countNode) {
      countNode.textContent = String(counts[category] || 0);
    }
  });
}

function createCategoryBadge(category) {
  const badge = document.createElement('span');
  badge.className = `category-badge category-${category}`;
  badge.textContent = CATEGORY_LABELS[category] || CATEGORY_LABELS.text;
  return badge;
}

function createTextContent(item) {
  const category = getItemCategory(item);
  const wrap = document.createElement('div');
  wrap.className = 'text-content';

  if (category === 'credential' || category === 'longText') {
    wrap.append(createCategoryBadge(category));
  }

  const text = document.createElement('p');
  text.className = 'text-preview';
  text.textContent = item.text || item.preview || '';

  wrap.append(text);
  return wrap;
}

function createImageContent(item) {
  const wrap = document.createElement('div');
  wrap.className = 'image-preview';

  const image = document.createElement('img');
  image.src = item.imageSrc;
  image.alt = '剪贴板图片';

  const meta = document.createElement('span');
  meta.textContent = item.width && item.height ? `图片 ${item.width} × ${item.height}` : '图片';

  wrap.append(image, meta);
  return wrap;
}

function getVisibleImages() {
  return filteredItems.filter((item) => item.type === 'image' && item.imageSrc);
}

function setImageModalItem(item) {
  if (item.type !== 'image' || !item.imageSrc) {
    return;
  }

  imageModalImg.src = item.imageSrc;
  imageModalMeta.textContent = item.width && item.height ? `图片 ${item.width} × ${item.height}` : '图片';
  const images = getVisibleImages();
  imagePrevButton.disabled = images.length <= 1;
  imageNextButton.disabled = images.length <= 1;
}

function openImageModal(item) {
  const images = getVisibleImages();
  currentImageIndex = Math.max(0, images.findIndex((image) => image.id === item.id));
  setImageModalItem(images[currentImageIndex] || item);
  imageModal.hidden = false;
  imageModalClose.focus();
}

function closeImageModal() {
  imageModal.hidden = true;
  imageModalImg.removeAttribute('src');
  currentImageIndex = -1;
}

function moveImageModal(offset) {
  const images = getVisibleImages();
  if (images.length <= 1) {
    return;
  }

  currentImageIndex = (currentImageIndex + offset + images.length) % images.length;
  setImageModalItem(images[currentImageIndex]);
}

function showCopyToast(message = '复制成功') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  const duration = message.length > 8 ? 1600 : 600;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

function playShowAnimation() {
  clearTimeout(windowAnimationTimer);
  appShell.classList.remove('is-leaving');
  appShell.classList.remove('is-entering');
  requestAnimationFrame(() => {
    appShell.classList.add('is-entering');
    windowAnimationTimer = setTimeout(() => {
      appShell.classList.remove('is-entering');
    }, 240);
  });
}

function hideWithAnimation() {
  clearTimeout(windowAnimationTimer);
  appShell.classList.remove('is-entering');
  appShell.classList.add('is-leaving');
  windowAnimationTimer = setTimeout(() => {
    appShell.classList.remove('is-leaving');
    window.clipboardTool.hideWindow();
  }, 170);
}

async function copyItem(item, node, shouldHide = false, feedbackButton = null) {
  const copied = await window.clipboardTool.copyHistoryItem(item.id);
  if (copied) {
    showCopyToast();

    if (node) {
      node.classList.add('copied');
      setTimeout(() => node.classList.remove('copied'), 900);
    }

    if (feedbackButton) {
      const originalText = feedbackButton.textContent;
      feedbackButton.textContent = '已复制';
      feedbackButton.disabled = true;
      setTimeout(() => {
        feedbackButton.textContent = originalText;
        feedbackButton.disabled = false;
      }, 900);
    }

    if (shouldHide) {
      setTimeout(hideWithAnimation, 360);
    }
  }
}

function formatBytes(bytes) {
  if (!bytes) {
    return '0 KB';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function applyTheme(theme) {
  selectedTheme = theme === 'dark' ? 'dark' : 'lime';
  document.body.classList.toggle('theme-dark', selectedTheme === 'dark');
  document.body.classList.toggle('theme-lime', selectedTheme === 'lime');
  themeButton.textContent = '换肤';
  themeButton.title = selectedTheme === 'dark' ? '切换到亮色青柠主题' : '切换到暗色玻璃主题';
}

function formatShortcut(shortcut) {
  return String(shortcut || 'Ctrl+Alt+V').replace(/\+/g, ' + ');
}

function normalizeRecordedShortcut(event) {
  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push('Ctrl');
  }
  if (event.altKey) {
    modifiers.push('Alt');
  }
  if (event.shiftKey) {
    modifiers.push('Shift');
  }
  if (event.metaKey) {
    modifiers.push('Super');
  }

  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);
  if (modifierKeys.has(event.key)) {
    return '';
  }

  const keyMap = {
    ' ': 'Space',
    Spacebar: 'Space',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  };
  let key = keyMap[event.key] || event.key;

  if (/^[a-z]$/i.test(key)) {
    key = key.toUpperCase();
  }

  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  const isSimpleKey = /^[A-Z0-9]$/.test(key);
  const allowedKeys = new Set([
    'Space',
    'Tab',
    'Enter',
    'Backspace',
    'Delete',
    'Insert',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Up',
    'Down',
    'Left',
    'Right'
  ]);

  if (!isFunctionKey && !isSimpleKey && !allowedKeys.has(key)) {
    return '';
  }

  if (!modifiers.length && !isFunctionKey) {
    return '';
  }

  return modifiers.concat(key).join('+');
}

function updateShortcutUi() {
  shortcutControl.querySelectorAll('button').forEach((button) => {
    const isActive = button.dataset.shortcut === selectedShortcutMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (isRecordingShortcut) {
    customShortcutButton.textContent = '正在录制';
    shortcutHelp.textContent = '现在按下组合键，按 Esc 取消。';
  } else if (selectedShortcutMode === 'custom') {
    customShortcutButton.textContent = formatShortcut(selectedCustomShortcut);
    shortcutHelp.textContent = hasUnsavedShortcut ? '确认后立即生效。' : '点自定义可以重新录制组合键。';
  } else {
    customShortcutButton.textContent = '录制';
    shortcutHelp.textContent = hasUnsavedShortcut ? '确认后立即生效。' : '点自定义后按下组合键，在本行确认生效。';
  }

  customShortcutButton.disabled = false;
  customShortcutButton.classList.toggle('is-recording', isRecordingShortcut);
  customShortcutButton.classList.toggle('has-unsaved', hasUnsavedShortcut);
  shortcutActions.hidden = !hasUnsavedShortcut || isRecordingShortcut;
}

function markShortcutDraftChanged() {
  hasUnsavedShortcut = selectedShortcutMode !== savedShortcutMode ||
    selectedCustomShortcut !== savedCustomShortcut;
}

function restoreSavedShortcutDraft() {
  selectedShortcutMode = savedShortcutMode;
  selectedCustomShortcut = savedCustomShortcut;
  isRecordingShortcut = false;
  hasUnsavedShortcut = false;
  updateShortcutUi();
}

function startShortcutRecording() {
  selectedShortcutMode = 'custom';
  isRecordingShortcut = true;
  markShortcutDraftChanged();
  updateShortcutUi();
  customShortcutButton.focus();
}

async function confirmShortcutDraft() {
  if (!hasUnsavedShortcut) {
    return;
  }

  const result = await window.clipboardTool.updateSettings({
    shortcutMode: selectedShortcutMode,
    customShortcut: selectedCustomShortcut
  });

  applyStatus({
    ...appStatus,
    settings: result.settings,
    stats: result.stats,
    shortcut: result.shortcut,
    maxHistory: result.settings.maxHistory
  });
  await refreshStatus();

  if (result.shortcutRegistered === false) {
    showCopyToast(result.shortcutError);
    return;
  }

  showCopyToast(`已生效：${formatShortcut(result.shortcut)}`);
}

function applyStatus(status) {
  appStatus = status;
  firstTip.hidden = status.settings.firstLaunchShown;
  selectedShortcutMode = status.settings.shortcutMode;
  selectedCustomShortcut = status.settings.customShortcut || 'Ctrl+Alt+V';
  savedShortcutMode = selectedShortcutMode;
  savedCustomShortcut = selectedCustomShortcut;
  selectedRecordImages = status.settings.recordImages;
  applyTheme(status.settings.theme);
  isRecordingShortcut = false;
  hasUnsavedShortcut = false;
  updateShortcutUi();
  maxHistoryInput.value = status.settings.maxHistory;
  recordImagesToggle.classList.toggle('active', selectedRecordImages);
  recordImagesToggle.setAttribute('aria-checked', String(selectedRecordImages));
  summaryTotal.textContent = String(status.stats.count);
  summaryText.textContent = String(status.stats.textCount);
  summaryImages.textContent = String(status.stats.imageCount);
  summaryImageSize.textContent = formatBytes(status.stats.imageBytes);
  summaryPath.textContent = status.stats.dataDir;
}

function openSettings() {
  if (appStatus) {
    applyStatus(appStatus);
  }

  settingsModal.hidden = false;
  appShell.classList.add('is-modal-open');
  settingsCloseButton.focus();
}

function closeSettings({ restoreDraft = true } = {}) {
  const discardedShortcutDraft = restoreDraft && hasUnsavedShortcut;
  if (restoreDraft) {
    restoreSavedShortcutDraft();
  }
  settingsModal.hidden = true;
  if (confirmModal.hidden) {
    appShell.classList.remove('is-modal-open');
  }
  if (discardedShortcutDraft) {
    showCopyToast('未保存的快捷键已取消');
  }
}

function askConfirm({ title, message, okText = '确认' }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOkButton.textContent = okText;
  confirmModal.hidden = false;
  appShell.classList.add('is-modal-open');
  confirmCancelButton.focus();

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function closeConfirm(result) {
  confirmModal.hidden = true;
  if (settingsModal.hidden) {
    appShell.classList.remove('is-modal-open');
  }
  if (pendingConfirmResolve) {
    pendingConfirmResolve(result);
    pendingConfirmResolve = null;
  }
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  updateCategoryBar();
  filteredItems = historyItems.filter((item) => matchesCategory(item) && matchesSearch(item, query));
  if (selectedIndex >= filteredItems.length) {
    selectedIndex = Math.max(0, filteredItems.length - 1);
  }

  historyList.textContent = '';
  emptyState.hidden = filteredItems.length > 0;
  if (historyItems.length === 0) {
    emptyTitle.textContent = '还没有记录';
    emptyDescription.textContent = '复制一段文字或一张图片后，这里会自动出现历史。';
  } else {
    emptyTitle.textContent = '没有符合的记录';
    emptyDescription.textContent = query ? '换个关键词，或者切回全部分类看看。' : '这个分类里暂时还没有内容。';
  }
  countText.textContent = `${filteredItems.length} / ${historyItems.length} 条记录`;
  clearButton.disabled = historyItems.length === 0;

  filteredItems.forEach((item, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    const mainButton = node.querySelector('.item-main');
    const content = node.querySelector('.item-content');
    const time = node.querySelector('time');
    const copyButton = node.querySelector('.copy-button');
    const deleteButton = node.querySelector('.delete-button');
    const category = getItemCategory(item);

    node.dataset.category = category;
    content.append(item.type === 'image' ? createImageContent(item) : createTextContent(item));
    time.textContent = formatTime(item.createdAt);
    mainButton.title = item.type === 'image' ? '查看图片' : '复制到剪贴板';
    node.classList.toggle('selected', showKeyboardSelection && index === selectedIndex);

    mainButton.addEventListener('click', async () => {
      selectedIndex = index;
      showKeyboardSelection = false;
      if (item.type === 'image') {
        await window.clipboardTool.openImageViewer(item.id);
      } else {
        await copyItem(item, node);
      }
    });

    copyButton.addEventListener('click', async () => {
      selectedIndex = index;
      showKeyboardSelection = false;
      await copyItem(item, node, false, copyButton);
    });

    deleteButton.addEventListener('click', async () => {
      pendingListPositions = captureListPositions();
      await window.clipboardTool.deleteHistoryItem(item.id);
    });

    historyList.append(node);
  });

  animateListReflow();
}

async function refreshStatus() {
  const status = await window.clipboardTool.getStatus();
  applyStatus(status);
  statusText.textContent = `本地保存，最多 ${status.maxHistory} 条，快捷键 ${status.shortcut}${status.isPaused ? '，当前已暂停监听' : '，后台自动记录'}`;
}

function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

function selectByOffset(offset) {
  if (filteredItems.length === 0) {
    selectedIndex = 0;
    showKeyboardSelection = false;
    render();
    return;
  }

  showKeyboardSelection = true;
  selectedIndex = Math.min(Math.max(selectedIndex + offset, 0), filteredItems.length - 1);
  render();

  const selectedNode = historyList.querySelector('.history-item.selected');
  if (selectedNode) {
    selectedNode.scrollIntoView({ block: 'nearest' });
  }
}

async function copySelectedAndHide() {
  if (filteredItems.length === 0) {
    return;
  }

  const selectedItem = filteredItems[selectedIndex];
  const selectedNode = historyList.querySelector('.history-item.selected');
  await copyItem(selectedItem, selectedNode, true);
}

async function deleteSelected() {
  if (filteredItems.length === 0) {
    return;
  }

  const selectedItem = filteredItems[selectedIndex];
  pendingListPositions = captureListPositions();
  await window.clipboardTool.deleteHistoryItem(selectedItem.id);
  selectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 2));
}

function captureListPositions() {
  const positions = new Map();
  historyList.querySelectorAll('.history-item[data-id]').forEach((node) => {
    positions.set(node.dataset.id, node.getBoundingClientRect());
  });
  return positions;
}

function animateListReflow() {
  if (!pendingListPositions) {
    return;
  }

  const previousPositions = pendingListPositions;
  pendingListPositions = null;

  historyList.querySelectorAll('.history-item[data-id]').forEach((node) => {
    const previous = previousPositions.get(node.dataset.id);
    if (!previous) {
      return;
    }

    const current = node.getBoundingClientRect();
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaY) < 1) {
      return;
    }

    node.classList.add('is-reflowing');
    node.style.transform = `translateY(${deltaY}px)`;
    node.style.transition = 'transform 0ms';
    node.getBoundingClientRect();

    requestAnimationFrame(() => {
      node.style.transform = '';
      node.style.transition = '';
      setTimeout(() => node.classList.remove('is-reflowing'), 230);
    });
  });
}

async function boot() {
  historyItems = await window.clipboardTool.listHistory();
  await refreshStatus();
  render();
}

searchInput.addEventListener('input', () => {
  selectedIndex = 0;
  showKeyboardSelection = false;
  render();
});

categoryBar.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-category]');
  if (!button) {
    return;
  }

  selectedCategory = button.dataset.category;
  selectedIndex = 0;
  showKeyboardSelection = false;
  render();
});

clearButton.addEventListener('click', async () => {
  if (historyItems.length === 0) {
    return;
  }

  const confirmed = await askConfirm({
    title: '清空全部历史？',
    message: '文字和图片历史都会从本机删除，这个操作无法撤销。',
    okText: '清空'
  });
  if (confirmed) {
    await window.clipboardTool.clearHistory();
    showCopyToast('已清空');
  }
});

imageModalClose.addEventListener('click', closeImageModal);
imagePrevButton.addEventListener('click', () => moveImageModal(-1));
imageNextButton.addEventListener('click', () => moveImageModal(1));
imageCopyButton.addEventListener('click', async () => {
  const images = getVisibleImages();
  const item = images[currentImageIndex];
  if (item) {
    await copyItem(item, null, false, imageCopyButton);
  }
});

imageModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-modal')) {
    closeImageModal();
  }
});

settingsButton.addEventListener('click', openSettings);
settingsCloseButton.addEventListener('click', closeSettings);

themeButton.addEventListener('click', async () => {
  const nextTheme = selectedTheme === 'dark' ? 'lime' : 'dark';
  applyTheme(nextTheme);
  const result = await window.clipboardTool.updateSettings({
    theme: nextTheme
  });
  applyStatus({
    ...appStatus,
    settings: result.settings,
    stats: result.stats,
    shortcut: result.shortcut,
    maxHistory: result.settings.maxHistory
  });
  showCopyToast(nextTheme === 'dark' ? '已切换暗肤' : '已切换亮肤');
});

settingsModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-settings')) {
    closeSettings();
  }
});

settingsSaveButton.addEventListener('click', async () => {
  if (hasUnsavedShortcut) {
    showCopyToast('请先确认或取消快捷键');
    return;
  }

  const result = await window.clipboardTool.updateSettings({
    maxHistory: Number(maxHistoryInput.value),
    recordImages: selectedRecordImages,
    theme: selectedTheme
  });
  applyStatus({
    ...appStatus,
    settings: result.settings,
    stats: result.stats,
    shortcut: result.shortcut,
    maxHistory: result.settings.maxHistory
  });
  await refreshStatus();
  if (result.shortcutRegistered === false) {
    showCopyToast(result.shortcutError);
    return;
  }
  showCopyToast('设置已完成');
  closeSettings({ restoreDraft: false });
});

shortcutControl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-shortcut]');
  if (!button) {
    return;
  }

  selectedShortcutMode = button.dataset.shortcut;
  isRecordingShortcut = false;
  markShortcutDraftChanged();
  updateShortcutUi();

  if (selectedShortcutMode === 'custom') {
    startShortcutRecording();
  }
});

customShortcutButton.addEventListener('click', () => {
  startShortcutRecording();
});

shortcutConfirmButton.addEventListener('click', confirmShortcutDraft);

shortcutCancelButton.addEventListener('click', () => {
  restoreSavedShortcutDraft();
  showCopyToast('已取消');
});

recordImagesToggle.addEventListener('click', () => {
  selectedRecordImages = !selectedRecordImages;
  recordImagesToggle.classList.toggle('active', selectedRecordImages);
  recordImagesToggle.setAttribute('aria-checked', String(selectedRecordImages));
});

settingsClearButton.addEventListener('click', async () => {
  const confirmed = await askConfirm({
    title: '清空全部历史？',
    message: '会删除当前保存的文字和图片历史，但不会改变你的设置。',
    okText: '清空'
  });
  if (confirmed) {
    await window.clipboardTool.clearHistory();
    await refreshStatus();
    showCopyToast('已清空');
  }
});

confirmCancelButton.addEventListener('click', () => closeConfirm(false));
confirmOkButton.addEventListener('click', () => closeConfirm(true));

confirmModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-confirm')) {
    closeConfirm(false);
  }
});

firstTipButton.addEventListener('click', async () => {
  await window.clipboardTool.dismissFirstLaunch();
  await refreshStatus();
});

window.addEventListener('keydown', (event) => {
  if (!confirmModal.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirm(false);
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      closeConfirm(true);
    }

    return;
  }

  if (isRecordingShortcut) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      restoreSavedShortcutDraft();
      showCopyToast('已取消');
      return;
    }

    const shortcut = normalizeRecordedShortcut(event);
    if (shortcut) {
      selectedCustomShortcut = shortcut;
      selectedShortcutMode = 'custom';
      isRecordingShortcut = false;
      hasUnsavedShortcut = true;
      updateShortcutUi();
      showCopyToast('已录制，点确认生效');
      return;
    }

    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      showCopyToast('请按组合键，比如 Ctrl + Alt + V');
    }
    return;
  }

  if (!settingsModal.hidden && event.key !== 'Escape') {
    return;
  }

  if (!imageModal.hidden && event.key !== 'Escape') {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveImageModal(-1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveImageModal(1);
    }

    return;
  }

  if (event.key !== 'Escape') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectByOffset(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectByOffset(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      copySelectedAndHide();
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      deleteSelected();
      return;
    }

    return;
  }

  if (!imageModal.hidden) {
    closeImageModal();
    return;
  }

  if (!settingsModal.hidden) {
    closeSettings();
    return;
  }

  hideWithAnimation();
});

window.clipboardTool.onHistoryUpdated(async (items) => {
  historyItems = items;
  await refreshStatus();
  render();
});

window.clipboardTool.onFocusSearch(() => {
  showKeyboardSelection = false;
  playShowAnimation();
  setTimeout(focusSearch, 0);
});

boot();
