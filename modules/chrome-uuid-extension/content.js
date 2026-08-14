// content.js —— 页面悬浮复制按钮
const DEFAULTS = {
  format: 'dashed',
  showFloating: true,
  floatingPos: null
};

const REGEX = {
  dashed: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  plain: /\b[0-9a-f]{32}\b/gi
};

function addDashes(uuid) {
  return uuid.replace(
    /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i,
    '$1-$2-$3-$4-$5'
  );
}

function stripDashes(uuid) {
  return uuid.replace(/-/g, '');
}

function extractUuid(url, format) {
  if (format === 'plain') {
    const m = url.match(REGEX.plain);
    if (m) return { raw: m[0], value: stripDashes(m[0]).toLowerCase() };
    const m2 = url.match(REGEX.dashed);
    if (m2) return { raw: m2[0], value: stripDashes(m2[0]).toLowerCase() };
    return null;
  }
  const m = url.match(REGEX.dashed);
  if (m) return { raw: m[0], value: m[0].toLowerCase() };
  const m2 = url.match(REGEX.plain);
  if (m2) return { raw: m2[0], value: addDashes(m2[0]).toLowerCase() };
  return null;
}

let btn = null;
let dragging = false;
let moved = 0;
let startX = 0;
let startY = 0;
let originLeft = 0;
let originTop = 0;

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const found = extractUuid(location.href, settings.format);
  if (settings.showFloating && found) {
    createButton(settings, found.value);
  }
}

function createButton(settings, uuid) {
  btn = document.createElement('button');
  btn.id = 'uuid-float-btn';
  btn.textContent = '复制 UUID';
  btn.title = uuid;
  document.documentElement.appendChild(btn);

  if (settings.floatingPos) {
    btn.style.left = settings.floatingPos.x + 'px';
    btn.style.top = settings.floatingPos.y + 'px';
  }

  btn.addEventListener('mousedown', onMouseDown);
  btn.addEventListener('click', () => {
    if (moved > 4) return; // 拖拽而非点击
    copyUuid(uuid);
  });
}

function onMouseDown(e) {
  e.preventDefault();
  dragging = true;
  moved = 0;
  startX = e.clientX;
  startY = e.clientY;
  originLeft = btn.offsetLeft;
  originTop = btn.offsetTop;
  btn.classList.add('dragging');
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e) {
  if (!dragging) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
  let left = originLeft + dx;
  let top = originTop + dy;
  left = Math.max(4, Math.min(left, window.innerWidth - btn.offsetWidth - 4));
  top = Math.max(4, Math.min(top, window.innerHeight - btn.offsetHeight - 4));
  btn.style.left = left + 'px';
  btn.style.top = top + 'px';
}

async function onMouseUp() {
  dragging = false;
  btn.classList.remove('dragging');
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  // 记住位置
  await chrome.storage.sync.set({
    floatingPos: { x: btn.offsetLeft, y: btn.offsetTop }
  });
}

async function copyUuid(uuid) {
  try {
    await navigator.clipboard.writeText(uuid);
    flash('已复制：' + uuid);
  } catch (e) {
    fallbackCopy(uuid);
  }
}

function fallbackCopy(uuid) {
  const ta = document.createElement('textarea');
  ta.value = uuid;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    flash('已复制：' + uuid);
  } catch (e) {
    flash('复制失败');
  }
  ta.remove();
}

function flash(msg) {
  btn.textContent = msg;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = '复制 UUID';
    btn.classList.remove('copied');
  }, 1200);
}

init();
