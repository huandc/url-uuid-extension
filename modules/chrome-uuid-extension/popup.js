const FORMAT_KEY = "uuidFormat";
const FAB_VISIBLE_KEY = "fabVisible";

const FORMATS = {
  dashed: {
    id: "dashed",
    pattern:
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    global:
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    errorHint: "请输入有效的 UUID（xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）",
    format(value) {
      return toDashedUuid(value);
    },
    isValid(value) {
      return this.pattern.test(toDashedUuid(value));
    },
  },
  compact: {
    id: "compact",
    pattern: /[0-9a-f]{12}[1-5][0-9a-f]{3}[89ab][0-9a-f]{15}/i,
    global: /[0-9a-f]{12}[1-5][0-9a-f]{3}[89ab][0-9a-f]{15}/gi,
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    errorHint: "请输入有效的 UUID（32 位十六进制，不含 -）",
    format(value) {
      return toCompactUuid(value);
    },
    isValid(value) {
      return this.pattern.test(toCompactUuid(value));
    },
  },
};

const formatSelect = document.getElementById("formatSelect");
const fabVisibleToggle = document.getElementById("fabVisibleToggle");
const currentUuidEl = document.getElementById("currentUuid");
const copyBtn = document.getElementById("copyBtn");
const copyLabel = document.getElementById("copyLabel");
const urlHintEl = document.getElementById("urlHint");
const uuidInput = document.getElementById("uuidInput");
const inputErrorEl = document.getElementById("inputError");
const applyBtn = document.getElementById("applyBtn");
const statusEl = document.getElementById("status");

let currentTab = null;
let currentUuid = null;
let currentFormatId = "dashed";

function getFormat() {
  return FORMATS[currentFormatId] || FORMATS.dashed;
}

function toCompactUuid(value) {
  return value.trim().replace(/-/g, "").toLowerCase();
}

function toDashedUuid(value) {
  const compact = toCompactUuid(value);
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return value.trim().toLowerCase();
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function extractUuid(url) {
  const format = getFormat();
  const match = url.match(format.pattern);
  return match ? format.format(match[0]) : null;
}

function replaceUuid(url, newUuid) {
  const format = getFormat();
  if (!url.match(format.pattern)) {
    return null;
  }
  return url.replace(format.global, format.format(newUuid));
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function truncateUrl(url, max = 52) {
  if (url.length <= max) {
    return url;
  }
  const head = Math.floor(max * 0.55);
  const tail = max - head - 3;
  return `${url.slice(0, head)}...${url.slice(-tail)}`;
}

function updateInputState() {
  const format = getFormat();
  const raw = uuidInput.value.trim();
  const hasCurrentUuid = Boolean(currentUuid);
  const valid = raw.length === 0 || format.isValid(raw);

  uuidInput.classList.toggle("invalid", raw.length > 0 && !valid);
  inputErrorEl.classList.toggle("hidden", raw.length === 0 || valid);
  inputErrorEl.textContent = raw.length > 0 && !valid ? format.errorHint : "";

  applyBtn.disabled = !hasCurrentUuid || !valid || raw.length === 0;
}

function applyFormatToUi() {
  const format = getFormat();
  uuidInput.placeholder = currentUuid || format.placeholder;

  if (uuidInput.value.trim()) {
    const formatted = format.format(uuidInput.value);
    if (format.isValid(uuidInput.value)) {
      uuidInput.value = formatted;
    }
  }

  updateInputState();
}

async function saveFormat(formatId) {
  currentFormatId = FORMATS[formatId] ? formatId : "dashed";
  formatSelect.value = currentFormatId;
  await chrome.storage.sync.set({ [FORMAT_KEY]: currentFormatId });
}

async function saveFabVisible(visible) {
  fabVisibleToggle.checked = visible;
  await chrome.storage.sync.set({ [FAB_VISIBLE_KEY]: visible });
}

async function loadSettings() {
  const data = await chrome.storage.sync.get({
    [FORMAT_KEY]: "dashed",
    [FAB_VISIBLE_KEY]: true,
  });
  currentFormatId = FORMATS[data[FORMAT_KEY]] ? data[FORMAT_KEY] : "dashed";
  formatSelect.value = currentFormatId;
  fabVisibleToggle.checked = data[FAB_VISIBLE_KEY] !== false;
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    currentUuid = null;
    currentUuidEl.textContent = "无法读取此页面";
    currentUuidEl.classList.add("empty");
    urlHintEl.textContent = "请在普通网页中使用此插件";
    copyBtn.disabled = true;
    applyBtn.disabled = true;
    applyFormatToUi();
    return;
  }

  currentUuid = extractUuid(tab.url);

  if (currentUuid) {
    currentUuidEl.textContent = currentUuid;
    currentUuidEl.classList.remove("empty");
    currentUuidEl.title = currentUuid;
    copyBtn.disabled = false;
    uuidInput.placeholder = currentUuid;
  } else {
    currentUuidEl.textContent = "未找到 UUID";
    currentUuidEl.classList.add("empty");
    urlHintEl.textContent = `当前 URL 中不包含所选格式的 UUID`;
    copyBtn.disabled = true;
    applyBtn.disabled = true;
  }

  urlHintEl.textContent = truncateUrl(tab.url);
  applyFormatToUi();
}

async function copyUuid() {
  if (!currentUuid) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentUuid);
    copyLabel.textContent = "已复制";
    copyBtn.classList.add("copied");
    setStatus("UUID 已复制到剪贴板", "success");

    setTimeout(() => {
      copyLabel.textContent = "复制";
      copyBtn.classList.remove("copied");
      setStatus("");
    }, 1800);
  } catch {
    setStatus("复制失败，请检查权限", "error");
  }
}

async function applyUuid() {
  const format = getFormat();
  const newUuid = format.format(uuidInput.value);

  if (!currentTab?.id || !currentUuid || !format.isValid(newUuid)) {
    return;
  }

  const newUrl = replaceUuid(currentTab.url, newUuid);
  if (!newUrl) {
    setStatus("无法替换 URL 中的 UUID", "error");
    return;
  }

  applyBtn.disabled = true;
  setStatus("正在跳转...");

  try {
    await chrome.tabs.update(currentTab.id, { url: newUrl });
    window.close();
  } catch {
    setStatus("更新失败，请重试", "error");
    applyBtn.disabled = false;
  }
}

formatSelect.addEventListener("change", async () => {
  await saveFormat(formatSelect.value);
  await loadCurrentTab();
});

fabVisibleToggle.addEventListener("change", async () => {
  await saveFabVisible(fabVisibleToggle.checked);
  setStatus(fabVisibleToggle.checked ? "已开启悬浮按钮" : "已隐藏悬浮按钮", "success");
  setTimeout(() => setStatus(""), 1500);
});

copyBtn.addEventListener("click", copyUuid);
applyBtn.addEventListener("click", applyUuid);
uuidInput.addEventListener("input", () => {
  const format = getFormat();
  const raw = uuidInput.value.trim();
  if (raw && format.isValid(raw)) {
    const formatted = format.format(raw);
    if (formatted !== uuidInput.value) {
      uuidInput.value = formatted;
    }
  }
  updateInputState();
});
uuidInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !applyBtn.disabled) {
    applyUuid();
  }
});

(async () => {
  await loadSettings();
  await loadCurrentTab();
})();
