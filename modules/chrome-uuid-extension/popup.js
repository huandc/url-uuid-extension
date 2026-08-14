// popup.js —— 弹窗逻辑
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

// 按所选格式提取 UUID，返回 { raw, value }；找不到时返回 null
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

// 校验并规范化用户输入的新 UUID
function normalizeUuid(value, format) {
  const plain = value.trim().toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(plain)) return null;
  return format === 'plain' ? plain : addDashes(plain);
}

const els = {
  pageUrl: document.getElementById('pageUrl'),
  formatSelect: document.getElementById('formatSelect'),
  showFloating: document.getElementById('showFloating'),
  uuidDisplay: document.getElementById('uuidDisplay'),
  copyBtn: document.getElementById('copyBtn'),
  newUuidInput: document.getElementById('newUuidInput'),
  replaceBtn: document.getElementById('replaceBtn'),
  status: document.getElementById('status')
};

let currentTab = null;
let currentUuid = null;

function setStatus(msg, ok) {
  els.status.textContent = msg || '';
  els.status.className = ok ? 'ok' : 'err';
}

async function loadSettings() {
  return chrome.storage.sync.get(DEFAULTS);
}

function saveSettings(partial) {
  return chrome.storage.sync.set(partial);
}

async function render() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;
  const url = tab && tab.url ? tab.url : '';
  els.pageUrl.textContent = url || '无法读取当前页面';
  els.pageUrl.title = url;

  const settings = await loadSettings();
  currentUuid = url ? extractUuid(url, settings.format) : null;

  if (currentUuid) {
    els.uuidDisplay.textContent = currentUuid.value;
    els.uuidDisplay.classList.remove('empty');
    els.copyBtn.disabled = false;
    els.replaceBtn.disabled = false;
    els.newUuidInput.placeholder = '例如：' + currentUuid.value;
  } else {
    els.uuidDisplay.textContent = '未检测到 UUID';
    els.uuidDisplay.classList.add('empty');
    els.copyBtn.disabled = true;
    els.replaceBtn.disabled = true;
    els.newUuidInput.placeholder = '当前页面未检测到 UUID';
  }
}

async function copyCurrent() {
  if (!currentUuid) return;
  try {
    await navigator.clipboard.writeText(currentUuid.value);
    setStatus('已复制：' + currentUuid.value, true);
  } catch (e) {
    setStatus('复制失败', false);
  }
}

async function replaceAndRefresh() {
  if (!currentTab || !currentUuid) {
    setStatus('当前页面没有可替换的 UUID', false);
    return;
  }
  const settings = await loadSettings();
  const newUuid = normalizeUuid(els.newUuidInput.value, settings.format);
  if (!newUuid) {
    setStatus('请输入合法的 UUID（32 位十六进制）', false);
    return;
  }
  if (newUuid === currentUuid.value) {
    setStatus('新 UUID 与当前相同', false);
    return;
  }
  const newUrl = currentTab.url.replace(currentUuid.raw, newUuid);
  setStatus('正在刷新…', true);
  await chrome.tabs.update(currentTab.id, { url: newUrl });
  window.close();
}

els.formatSelect.addEventListener('change', async () => {
  await saveSettings({ format: els.formatSelect.value });
  await render();
  setStatus('UUID 格式已保存', true);
});

els.showFloating.addEventListener('change', async () => {
  await saveSettings({ showFloating: els.showFloating.checked });
  setStatus(
    els.showFloating.checked ? '已开启悬浮按钮' : '已关闭悬浮按钮',
    true
  );
});

els.copyBtn.addEventListener('click', copyCurrent);
els.replaceBtn.addEventListener('click', replaceAndRefresh);
els.newUuidInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') replaceAndRefresh();
});

render();
