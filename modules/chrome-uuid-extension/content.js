const FORMAT_KEY = "uuidFormat";
const UUID_REGEX_KEY = "uuidRegex";
const FAB_VISIBLE_KEY = "fabVisible";
const FAB_POSITION_KEY = "fabPosition";
const DRAG_THRESHOLD = 5;

const FORMATS = {
  dashed: {
    pattern:
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    format(value) {
      return toDashedUuid(value);
    },
  },
  compact: {
    pattern: /[0-9a-f]{12}[1-5][0-9a-f]{3}[89ab][0-9a-f]{15}/i,
    format(value) {
      return toCompactUuid(value);
    },
  },
};

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

let fab = null;
let currentUuid = null;
let currentFormatId = "dashed";
let customRegexSource = "";
let fabVisible = true;
let fabPosition = null;
let resetTimer = null;
let lastUrl = location.href;
let dragState = null;

function getFormat() {
  if (currentFormatId === "custom") {
    return buildCustomFormat();
  }
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

function parseRegexSource(source) {
  const s = (source || "").trim();
  // 兼容 /pattern/ 写法
  if (s.length > 2 && s.startsWith("/") && s.endsWith("/")) {
    return s.slice(1, -1);
  }
  return s;
}

function compileCustomPattern() {
  const source = parseRegexSource(customRegexSource);
  if (!source) {
    return null;
  }
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

function buildCustomFormat() {
  const pattern = compileCustomPattern();
  return {
    id: "custom",
    pattern,
    global: pattern ? new RegExp(pattern.source, "gi") : null,
    format(value) {
      return value.trim();
    },
  };
}

function extractUuid(url) {
  const format = getFormat();
  if (!format.pattern) {
    return null;
  }
  const match = url.match(format.pattern);
  return match ? format.format(match[0]) : null;
}

async function loadSettings() {
  try {
    const data = await chrome.storage.sync.get({
      [FORMAT_KEY]: "dashed",
      [UUID_REGEX_KEY]: "",
      [FAB_VISIBLE_KEY]: true,
      [FAB_POSITION_KEY]: null,
    });
    const format = data[FORMAT_KEY];
    currentFormatId = format === "custom" || FORMATS[format] ? format : "dashed";
    customRegexSource = data[UUID_REGEX_KEY] || "";
    fabVisible = data[FAB_VISIBLE_KEY] !== false;
    fabPosition = normalizePosition(data[FAB_POSITION_KEY]);
  } catch {
    currentFormatId = "dashed";
    customRegexSource = "";
    fabVisible = true;
    fabPosition = null;
  }
}

function normalizePosition(pos) {
  if (!pos || typeof pos.left !== "number" || typeof pos.top !== "number") {
    return null;
  }
  return clampPosition(pos.left, pos.top);
}

function clampPosition(left, top) {
  if (!fab) {
    return { left, top };
  }

  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - fab.offsetWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - fab.offsetHeight - margin);

  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

function applyFabPosition() {
  if (!fab) {
    return;
  }

  if (fabPosition) {
    const pos = clampPosition(fabPosition.left, fabPosition.top);
    fab.style.left = `${pos.left}px`;
    fab.style.top = `${pos.top}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  } else {
    fab.style.left = "";
    fab.style.top = "";
    fab.style.right = "";
    fab.style.bottom = "";
  }
}

async function saveFabPosition(left, top) {
  fabPosition = clampPosition(left, top);
  try {
    await chrome.storage.sync.set({ [FAB_POSITION_KEY]: fabPosition });
  } catch {
    // ignore
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

function removeFab() {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  endDrag(false);
  fab?.remove();
  fab = null;
  currentUuid = null;
}

function renderFabContent(copied) {
  if (!fab) {
    return;
  }

  if (copied) {
    fab.classList.add("copied");
    fab.innerHTML = `${CHECK_ICON}<span class="uuid-copy-fab-label">已复制</span>`;
  } else {
    fab.classList.remove("copied");
    fab.innerHTML = `${COPY_ICON}<span class="uuid-copy-fab-label">复制 UUID</span>`;
  }
  fab.title = currentUuid ? `${currentUuid}（可拖动）` : "可拖动";
}

function showCopiedState() {
  if (!fab) {
    return;
  }

  renderFabContent(true);

  if (resetTimer) {
    clearTimeout(resetTimer);
  }

  resetTimer = setTimeout(() => {
    if (!fab || !currentUuid) {
      return;
    }
    renderFabContent(false);
    resetTimer = null;
  }, 1600);
}

function endDrag(save) {
  if (!dragState) {
    return;
  }

  const { moved, left, top } = dragState;
  dragState = null;
  fab?.classList.remove("dragging");
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  document.removeEventListener("pointercancel", onPointerUp);

  if (save && moved && fab) {
    saveFabPosition(left, top);
  }
}

function onPointerMove(event) {
  if (!dragState || !fab) {
    return;
  }

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  if (!dragState.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
    dragState.moved = true;
    fab.classList.add("dragging");
  }

  if (!dragState.moved) {
    return;
  }

  event.preventDefault();
  const next = clampPosition(dragState.originLeft + dx, dragState.originTop + dy);
  dragState.left = next.left;
  dragState.top = next.top;
  fab.style.left = `${next.left}px`;
  fab.style.top = `${next.top}px`;
  fab.style.right = "auto";
  fab.style.bottom = "auto";
}

function onPointerUp(event) {
  if (!dragState || !fab) {
    return;
  }

  const wasMoved = dragState.moved;
  endDrag(true);

  if (!wasMoved) {
    event.preventDefault();
    copyText(currentUuid).then((ok) => {
      if (ok) {
        showCopiedState();
      }
    });
  }
}

function enableDrag(button) {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !fab) {
      return;
    }

    event.preventDefault();
    const rect = fab.getBoundingClientRect();

    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      left: rect.left,
      top: rect.top,
      moved: false,
    };

    fab.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  });
}

function createFab(uuid) {
  removeFab();
  currentUuid = uuid;

  fab = document.createElement("button");
  fab.id = "uuid-copy-fab";
  fab.type = "button";
  renderFabContent(false);
  enableDrag(fab);

  document.documentElement.appendChild(fab);
  applyFabPosition();
}

function syncFab() {
  if (!fabVisible) {
    removeFab();
    return;
  }

  const uuid = extractUuid(location.href);
  if (!uuid) {
    removeFab();
    return;
  }

  if (fab && currentUuid === uuid) {
    applyFabPosition();
    return;
  }

  createFab(uuid);
}

function watchUrlChanges() {
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      syncFab();
    }
  });

  observer.observe(document, { subtree: true, childList: true });
  window.addEventListener("popstate", () => {
    lastUrl = location.href;
    syncFab();
  });
  window.addEventListener("hashchange", () => {
    lastUrl = location.href;
    syncFab();
  });
  window.addEventListener("resize", () => {
    if (!fab || !fabPosition) {
      return;
    }
    fabPosition = clampPosition(fabPosition.left, fabPosition.top);
    applyFabPosition();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }

  let shouldSync = false;

  if (changes[FORMAT_KEY]) {
    const next = changes[FORMAT_KEY].newValue;
    currentFormatId = next === "custom" || FORMATS[next] ? next : "dashed";
    shouldSync = true;
  }

  if (changes[UUID_REGEX_KEY]) {
    customRegexSource = changes[UUID_REGEX_KEY].newValue || "";
    shouldSync = true;
  }

  if (changes[FAB_VISIBLE_KEY]) {
    fabVisible = changes[FAB_VISIBLE_KEY].newValue !== false;
    shouldSync = true;
  }

  if (changes[FAB_POSITION_KEY]) {
    fabPosition = normalizePosition(changes[FAB_POSITION_KEY].newValue);
    applyFabPosition();
  }

  if (shouldSync) {
    syncFab();
  }
});

(async () => {
  await loadSettings();
  syncFab();
  watchUrlChanges();
})();
