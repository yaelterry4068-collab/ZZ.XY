const viewerStage = document.querySelector('#viewerStage');
const imageCanvas = document.querySelector('#imageCanvas');
const viewerImage = document.querySelector('#viewerImage');
const imageMeta = document.querySelector('#imageMeta');
const prevButton = document.querySelector('#prevButton');
const nextButton = document.querySelector('#nextButton');
const zoomOutButton = document.querySelector('#zoomOutButton');
const zoomInButton = document.querySelector('#zoomInButton');
const zoomText = document.querySelector('#zoomText');
const copyButton = document.querySelector('#copyButton');
const closeButton = document.querySelector('#closeButton');
const viewerToast = document.querySelector('#viewerToast');

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.18;

let toastTimer;
let currentItem = null;
let naturalWidth = 1;
let naturalHeight = 1;
let zoom = 1;
let fitZoom = 1;
let dragState = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function showToast(message) {
  clearTimeout(toastTimer);
  viewerToast.textContent = message;
  viewerToast.hidden = false;
  toastTimer = setTimeout(() => {
    viewerToast.hidden = true;
  }, 700);
}

function updateZoomText() {
  zoomText.textContent = `${Math.round(zoom * 100)}%`;
}

function resizeCanvas() {
  const imageWidth = Math.max(1, Math.round(naturalWidth * zoom));
  const imageHeight = Math.max(1, Math.round(naturalHeight * zoom));
  viewerImage.style.width = `${imageWidth}px`;
  viewerImage.style.height = `${imageHeight}px`;
  imageCanvas.style.width = `${Math.max(viewerStage.clientWidth, imageWidth + 48)}px`;
  imageCanvas.style.height = `${Math.max(viewerStage.clientHeight, imageHeight + 48)}px`;
  updateZoomText();
}

function calculateFitZoom() {
  const availableWidth = Math.max(1, viewerStage.clientWidth - 48);
  const availableHeight = Math.max(1, viewerStage.clientHeight - 48);
  return clamp(Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight), MIN_ZOOM, 1);
}

function centerImage() {
  viewerStage.scrollLeft = Math.max(0, (imageCanvas.scrollWidth - viewerStage.clientWidth) / 2);
  viewerStage.scrollTop = Math.max(0, (imageCanvas.scrollHeight - viewerStage.clientHeight) / 2);
}

function setZoom(nextZoom, anchor = null) {
  const previousZoom = zoom;
  zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

  if (!anchor) {
    resizeCanvas();
    centerImage();
    return;
  }

  const beforeX = viewerStage.scrollLeft + anchor.x;
  const beforeY = viewerStage.scrollTop + anchor.y;
  const ratio = zoom / previousZoom;
  resizeCanvas();
  viewerStage.scrollLeft = beforeX * ratio - anchor.x;
  viewerStage.scrollTop = beforeY * ratio - anchor.y;
}

function fitToWindow() {
  fitZoom = calculateFitZoom();
  setZoom(fitZoom);
}

function applyPayload(payload) {
  const item = payload?.item;
  if (!item) {
    currentItem = null;
    imageMeta.textContent = '图片不可用';
    viewerImage.removeAttribute('src');
    prevButton.disabled = true;
    nextButton.disabled = true;
    zoomOutButton.disabled = true;
    zoomInButton.disabled = true;
    zoomText.disabled = true;
    copyButton.disabled = true;
    return;
  }

  currentItem = item;
  const sizeText = item.width && item.height ? `${item.width} × ${item.height}` : '图片';
  const indexText = payload.count > 1 ? ` · ${payload.index + 1}/${payload.count}` : '';
  imageMeta.textContent = `${sizeText}${indexText}`;
  prevButton.disabled = payload.count <= 1;
  nextButton.disabled = payload.count <= 1;
  zoomOutButton.disabled = false;
  zoomInButton.disabled = false;
  zoomText.disabled = false;
  copyButton.disabled = false;

  viewerImage.onload = () => {
    naturalWidth = viewerImage.naturalWidth || item.width || 1;
    naturalHeight = viewerImage.naturalHeight || item.height || 1;
    fitToWindow();
  };
  viewerImage.src = item.imageSrc;
}

prevButton.addEventListener('click', () => {
  window.clipboardTool.moveImageViewer(-1);
});

nextButton.addEventListener('click', () => {
  window.clipboardTool.moveImageViewer(1);
});

zoomOutButton.addEventListener('click', () => {
  setZoom(zoom / ZOOM_STEP);
});

zoomInButton.addEventListener('click', () => {
  setZoom(zoom * ZOOM_STEP);
});

zoomText.addEventListener('click', fitToWindow);

copyButton.addEventListener('click', async () => {
  const copied = await window.clipboardTool.copyImageViewer();
  if (copied) {
    showToast('复制成功');
  }
});

closeButton.addEventListener('click', () => {
  window.clipboardTool.closeImageViewer();
});

viewerStage.addEventListener('wheel', (event) => {
  if (!currentItem) {
    return;
  }

  event.preventDefault();
  const rect = viewerStage.getBoundingClientRect();
  const anchor = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  const direction = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  setZoom(zoom * direction, anchor);
}, { passive: false });

viewerStage.addEventListener('pointerdown', (event) => {
  if (!currentItem || event.button !== 0) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    scrollLeft: viewerStage.scrollLeft,
    scrollTop: viewerStage.scrollTop
  };
  viewerStage.classList.add('is-dragging');
  viewerStage.setPointerCapture(event.pointerId);
});

viewerStage.addEventListener('pointermove', (event) => {
  if (!dragState) {
    return;
  }

  viewerStage.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.x);
  viewerStage.scrollTop = dragState.scrollTop - (event.clientY - dragState.y);
});

function stopDrag() {
  dragState = null;
  viewerStage.classList.remove('is-dragging');
}

viewerStage.addEventListener('pointerup', stopDrag);
viewerStage.addEventListener('pointercancel', stopDrag);

window.addEventListener('resize', () => {
  if (!currentItem) {
    return;
  }

  fitZoom = calculateFitZoom();
  if (zoom <= fitZoom * 1.05) {
    fitToWindow();
  } else {
    resizeCanvas();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    window.clipboardTool.closeImageViewer();
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    window.clipboardTool.moveImageViewer(-1);
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    window.clipboardTool.moveImageViewer(1);
    return;
  }

  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    setZoom(zoom * ZOOM_STEP);
    return;
  }

  if (event.key === '-') {
    event.preventDefault();
    setZoom(zoom / ZOOM_STEP);
    return;
  }

  if (event.key === '0') {
    event.preventDefault();
    fitToWindow();
  }
});

window.clipboardTool.onImageViewerData(applyPayload);
