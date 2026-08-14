// ==UserScript==
// @name         URL UUID 工具（油猴脚本）
// @namespace    https://github.com/huandc/url-uuid-extension
// @version      1.1.0
// @description  从当前页面 URL 中提取 UUID：悬浮按钮一键复制（可拖动、位置记忆），支持格式切换与替换后刷新
// @author       huandC
// @match        http://*/*
// @match        https://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const FORMAT_KEY = "uuidFormat";
  const UUID_REGEX_KEY = "uuidRegex";
  const FAB_POSITION_KEY = "fabPosition";
  const THEME_KEY = "theme";
  const DRAG_THRESHOLD = 5;
  const themeMq = window.matchMedia("(prefers-color-scheme: light)");

  const FORMATS = {
    dashed: {
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

  const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

  const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

  const GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;

  const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="18" y1="6" x2="6" y2="18"/>
  <line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

  let fab = null;
  let panel = null;
  let panelEls = null;
  let currentUuid = null;
  let currentFormatId = "dashed";
  let customRegexSource = "";
  let theme = "system";
  let fabPosition = null;
  let resetTimer = null;
  let lastUrl = location.href;
  let dragState = null;

  // ---------- UUID 工具 ----------

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
    const hasInput = customRegexSource.trim().length > 0;
    return {
      id: "custom",
      pattern,
      global: pattern ? new RegExp(pattern.source, "gi") : null,
      placeholder: "匹配自定义正则的任意文本",
      errorHint: hasInput ? "输入内容未匹配自定义正则" : "请输入或修正正则表达式",
      format(value) {
        return value.trim();
      },
      isValid(value) {
        return Boolean(pattern) && pattern.test(value.trim());
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

  function replaceUuid(url, newUuid) {
    const format = getFormat();
    if (!format.pattern || !format.global) {
      return null;
    }
    if (!url.match(format.pattern)) {
      return null;
    }
    return url.replace(format.global, format.format(newUuid));
  }

  // ---------- 主题 ----------

  function effectiveTheme() {
    if (theme === "system") {
      return themeMq.matches ? "light" : "dark";
    }
    return theme;
  }

  function applyTheme() {
    const eff = effectiveTheme();
    document.documentElement.classList.toggle("us-theme-light", eff === "light");
    document.documentElement.classList.toggle("us-theme-dark", eff === "dark");
  }

  // ---------- 存储 / 位置 ----------

  function loadSettings() {
    const format = GM_getValue(FORMAT_KEY, "dashed");
    currentFormatId = format === "custom" || FORMATS[format] ? format : "dashed";
    customRegexSource = GM_getValue(UUID_REGEX_KEY, "") || "";
    theme = GM_getValue(THEME_KEY, "system") === "light" || GM_getValue(THEME_KEY, "system") === "dark" ? GM_getValue(THEME_KEY, "system") : "system";
    fabPosition = normalizePosition(GM_getValue(FAB_POSITION_KEY, null));
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

  function saveFabPosition(left, top) {
    fabPosition = clampPosition(left, top);
    try {
      GM_setValue(FAB_POSITION_KEY, fabPosition);
    } catch (e) {
      // ignore
    }
  }

  // ---------- 复制 ----------

  async function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      try {
        const ret = GM_setClipboard(text, { type: "text/plain" });
        if (ret && typeof ret.then === "function") {
          await ret;
        }
        return true;
      } catch (e) {
        // fallthrough
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallthrough
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      // ignore
    }
    textarea.remove();
    return ok;
  }

  // ---------- 悬浮按钮（FAB） ----------

  function renderFabContent(copied) {
    if (!fab) {
      return;
    }
    const copyBtn = fab.querySelector(".uuid-fab-copy");
    if (copied) {
      fab.classList.add("copied");
      copyBtn.innerHTML = `${CHECK_ICON}<span>已复制</span>`;
    } else {
      fab.classList.remove("copied");
      copyBtn.innerHTML = `${COPY_ICON}<span>复制 UUID</span>`;
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
    const { moved, pressTarget } = dragState;
    endDrag(true);

    if (moved) {
      return;
    }
    event.preventDefault();
    const gearBtn = fab.querySelector(".uuid-fab-gear");
    if (gearBtn && gearBtn.contains(pressTarget)) {
      togglePanel();
    } else if (currentUuid) {
      copyText(currentUuid).then((ok) => {
        if (ok) {
          showCopiedState();
        }
      });
    }
  }

  function enableDrag() {
    fab.addEventListener("pointerdown", (event) => {
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
        pressTarget: event.target,
      };
      try {
        fab.setPointerCapture?.(event.pointerId);
      } catch (e) {
        // ignore
      }
      document.addEventListener("pointermove", onPointerMove, { passive: false });
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    });
  }

  function createFab(uuid) {
    removeFab();
    currentUuid = uuid;

    fab = document.createElement("div");
    fab.id = "uuid-userscript-fab";
    fab.innerHTML = `
      <button class="uuid-fab-copy" type="button">${COPY_ICON}<span>复制 UUID</span></button>
      <button class="uuid-fab-gear" type="button" title="打开设置面板">${GEAR_ICON}</button>
    `;
    document.documentElement.appendChild(fab);
    renderFabContent(false);
    enableDrag();
    applyFabPosition();
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

  function syncFab() {
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

  // ---------- 设置面板 ----------

  function setPanelStatus(msg, ok) {
    if (!panelEls) {
      return;
    }
    panelEls.status.textContent = msg || "";
    panelEls.status.className = `uuid-panel-status${
      ok === true ? " ok" : ok === false ? " err" : ""
    }`;
  }

  function updateInputState() {
    if (!panelEls) {
      return;
    }
    const format = getFormat();
    const raw = panelEls.input.value.trim();
    const valid = raw.length === 0 || format.isValid(raw);

    let errorText = "";
    if (raw.length > 0 && !valid) {
      if (currentFormatId === "custom" && !format.pattern) {
        errorText = customRegexSource.trim()
          ? "正则表达式无效"
          : "请输入正则表达式";
      } else {
        errorText = format.errorHint;
      }
    }

    panelEls.input.classList.toggle("invalid", raw.length > 0 && !valid);
    panelEls.error.classList.toggle("hidden", raw.length === 0 || valid);
    panelEls.error.textContent = errorText;
    panelEls.apply.disabled = !currentUuid || !valid || raw.length === 0;

    if (raw && valid) {
      const formatted = format.format(raw);
      if (formatted !== panelEls.input.value) {
        panelEls.input.value = formatted;
      }
    }
  }

  function renderPanel() {
    if (!panelEls) {
      return;
    }
    panelEls.select.value = currentFormatId;
    panelEls.theme.value = theme;
    const format = getFormat();
    panelEls.input.placeholder = currentUuid || format.placeholder;

    // 自定义正则：显示/隐藏正则输入行并校验
    const showRegex = currentFormatId === "custom";
    panelEls.regexRow.classList.toggle("hidden", !showRegex);
    if (panelEls.regex.value !== customRegexSource) {
      panelEls.regex.value = customRegexSource;
    }
    const hasRegex = customRegexSource.trim().length > 0;
    const regexValid = !hasRegex || Boolean(compileCustomPattern());
    panelEls.regex.classList.toggle(
      "invalid",
      showRegex && hasRegex && !regexValid
    );
    panelEls.regexError.classList.toggle(
      "hidden",
      !showRegex || !hasRegex || regexValid
    );
    panelEls.regexError.textContent =
      showRegex && hasRegex && !regexValid ? "正则表达式无效" : "";

    if (currentUuid) {
      panelEls.code.textContent = currentUuid;
      panelEls.code.title = currentUuid;
    } else {
      panelEls.code.textContent = "未找到 UUID";
      panelEls.code.title = "";
    }
    updateInputState();
  }

  async function applyReplace() {
    if (!panelEls) {
      return;
    }
    const format = getFormat();
    const newUuid = format.format(panelEls.input.value);
    if (!currentUuid || !format.isValid(newUuid)) {
      return;
    }
    const newUrl = replaceUuid(location.href, newUuid);
    if (!newUrl) {
      setPanelStatus("无法替换 URL 中的 UUID", false);
      return;
    }
    setPanelStatus("正在刷新…", true);
    location.href = newUrl;
  }

  function togglePanel() {
    if (!panel) {
      return;
    }
    const hidden = panel.classList.toggle("hidden");
    if (!hidden) {
      renderPanel();
      panelEls.input.focus();
    }
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "uuid-userscript-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div class="uuid-panel-head">
        <span>URL UUID 工具</span>
        <button class="uuid-panel-close" type="button" title="关闭">${CLOSE_ICON}</button>
      </div>
      <div class="uuid-panel-body">
        <label for="uuid-panel-select">UUID 格式</label>
        <select id="uuid-panel-select" class="uuid-panel-select">
          <option value="dashed">UUID（带 -）</option>
          <option value="compact">UUID（不带 -）</option>
          <option value="custom">自定义格式（正则）</option>
        </select>
        <div class="uuid-panel-regex-row hidden">
          <label for="uuid-panel-regex">正则表达式</label>
          <input id="uuid-panel-regex" class="uuid-panel-regex" type="text"
            placeholder="例如：[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
            spellcheck="false" autocomplete="off" />
          <p class="uuid-panel-regex-error hidden"></p>
        </div>

        <div class="uuid-panel-theme-row">
          <label for="uuid-panel-theme">界面主题</label>
          <select id="uuid-panel-theme" class="uuid-panel-select">
            <option value="system">跟随系统</option>
            <option value="light">白色</option>
            <option value="dark">黑色</option>
          </select>
        </div>

        <label>当前 UUID</label>
        <div class="uuid-panel-current">
          <code class="uuid-panel-code" title="">—</code>
          <button class="uuid-panel-copy" type="button">复制</button>
        </div>

        <label for="uuid-panel-input">替换为</label>
        <input id="uuid-panel-input" class="uuid-panel-input" type="text"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          spellcheck="false" autocomplete="off" />
        <p class="uuid-panel-error hidden"></p>
        <button class="uuid-panel-apply" type="button" disabled>确定并刷新</button>
        <p class="uuid-panel-status"></p>
      </div>
    `;
    document.documentElement.appendChild(panel);

    panelEls = {
      select: panel.querySelector(".uuid-panel-select"),
      theme: panel.querySelector("#uuid-panel-theme"),
      regexRow: panel.querySelector(".uuid-panel-regex-row"),
      regex: panel.querySelector(".uuid-panel-regex"),
      regexError: panel.querySelector(".uuid-panel-regex-error"),
      code: panel.querySelector(".uuid-panel-code"),
      copy: panel.querySelector(".uuid-panel-copy"),
      input: panel.querySelector(".uuid-panel-input"),
      error: panel.querySelector(".uuid-panel-error"),
      apply: panel.querySelector(".uuid-panel-apply"),
      status: panel.querySelector(".uuid-panel-status"),
      close: panel.querySelector(".uuid-panel-close"),
    };

    panelEls.close.addEventListener("click", () => panel.classList.add("hidden"));
    panelEls.select.addEventListener("change", () => {
      const next = panelEls.select.value;
      currentFormatId = next === "custom" || FORMATS[next] ? next : "dashed";
      try {
        GM_setValue(FORMAT_KEY, currentFormatId);
      } catch (e) {
        // ignore
      }
      renderPanel();
      syncFab();
      if (currentFormatId === "custom") {
        panelEls.regex.focus();
      }
    });
    panelEls.regex.addEventListener("input", () => {
      customRegexSource = panelEls.regex.value;
      try {
        GM_setValue(UUID_REGEX_KEY, customRegexSource);
      } catch (e) {
        // ignore
      }
      renderPanel();
      syncFab();
    });
    panelEls.theme.addEventListener("change", () => {
      theme =
        panelEls.theme.value === "light" || panelEls.theme.value === "dark"
          ? panelEls.theme.value
          : "system";
      try {
        GM_setValue(THEME_KEY, theme);
      } catch (e) {
        // ignore
      }
      applyTheme();
    });
    panelEls.copy.addEventListener("click", async () => {
      if (!currentUuid) {
        return;
      }
      const ok = await copyText(currentUuid);
      setPanelStatus(ok ? `已复制：${currentUuid}` : "复制失败", ok);
    });
    panelEls.input.addEventListener("input", updateInputState);
    panelEls.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !panelEls.apply.disabled) {
        applyReplace();
      }
    });
    panelEls.apply.addEventListener("click", applyReplace);
  }

  // ---------- URL 变化监听（兼容 SPA） ----------

  function watchUrlChanges() {
    const refresh = () => {
      syncFab();
      if (panel && !panel.classList.contains("hidden")) {
        renderPanel();
      }
    };

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        refresh();
      }
    });
    observer.observe(document, { subtree: true, childList: true });

    window.addEventListener("popstate", () => {
      lastUrl = location.href;
      refresh();
    });
    window.addEventListener("hashchange", () => {
      lastUrl = location.href;
      refresh();
    });
    window.addEventListener("resize", () => {
      if (!fab || !fabPosition) {
        return;
      }
      fabPosition = clampPosition(fabPosition.left, fabPosition.top);
      applyFabPosition();
    });

    themeMq.addEventListener("change", () => {
      if (theme === "system") {
        applyTheme();
      }
    });
  }

  // ---------- 样式 ----------

  GM_addStyle(`
    #uuid-userscript-fab {
      position: fixed;
      right: 20px;
      bottom: 24px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      background: linear-gradient(135deg, #6366f1, #7c3aed);
      color: #fff;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      transition: box-shadow 0.15s ease, filter 0.15s ease;
    }
    #uuid-userscript-fab:hover {
      filter: brightness(1.08);
      box-shadow: 0 10px 28px rgba(99, 102, 241, 0.55);
    }
    #uuid-userscript-fab.dragging {
      cursor: grabbing;
      filter: brightness(1.05);
      transition: none;
    }
    #uuid-userscript-fab.copied {
      background: linear-gradient(135deg, #059669, #10b981);
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
    }
    #uuid-userscript-fab button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      padding: 6px 10px;
      border-radius: 999px;
      cursor: grab;
      white-space: nowrap;
    }
    #uuid-userscript-fab .uuid-fab-gear {
      padding: 6px;
    }
    #uuid-userscript-fab .uuid-fab-gear:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    #uuid-userscript-fab .uuid-fab-copy span {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #uuid-userscript-fab svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      pointer-events: none;
    }

    #uuid-userscript-panel {
      position: fixed;
      right: 20px;
      bottom: 84px;
      z-index: 2147483646;
      width: 300px;
      max-width: calc(100vw - 40px);
      background: #1a1d27;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-sizing: border-box;
    }
    #uuid-userscript-panel.hidden {
      display: none;
    }
    #uuid-userscript-panel * {
      box-sizing: border-box;
    }
    #uuid-userscript-panel .uuid-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 13px;
      font-weight: 600;
    }
    #uuid-userscript-panel .uuid-panel-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #a1a1aa;
      cursor: pointer;
    }
    #uuid-userscript-panel .uuid-panel-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f4f4f5;
    }
    #uuid-userscript-panel .uuid-panel-close svg {
      width: 14px;
      height: 14px;
    }
    #uuid-userscript-panel .uuid-panel-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #uuid-userscript-panel label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #a1a1aa;
    }
    #uuid-userscript-panel select,
    #uuid-userscript-panel input {
      width: 100%;
      padding: 8px 10px;
      background: #0f1117;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: #f4f4f5;
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    #uuid-userscript-panel select:focus,
    #uuid-userscript-panel input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.35);
    }
    #uuid-userscript-panel input {
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
    }
    #uuid-userscript-panel input.invalid {
      border-color: #f87171;
      box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
    }
    #uuid-userscript-panel .uuid-panel-current {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #uuid-userscript-panel .uuid-panel-code {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      background: #0f1117;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
      font-size: 11.5px;
      color: #818cf8;
      word-break: break-all;
      line-height: 1.4;
    }
    #uuid-userscript-panel .uuid-panel-copy {
      flex-shrink: 0;
      padding: 8px 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: #222633;
      color: #f4f4f5;
      font-size: 12px;
      cursor: pointer;
    }
    #uuid-userscript-panel .uuid-panel-copy:hover {
      background: #2a2f3d;
    }
    #uuid-userscript-panel .uuid-panel-error {
      font-size: 11px;
      color: #f87171;
      margin: -2px 0 0;
    }
    #uuid-userscript-panel .uuid-panel-error.hidden {
      display: none;
    }
    #uuid-userscript-panel .uuid-panel-apply {
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #6366f1, #7c3aed);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
    }
    #uuid-userscript-panel .uuid-panel-apply:hover:not(:disabled) {
      filter: brightness(1.08);
    }
    #uuid-userscript-panel .uuid-panel-apply:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #uuid-userscript-panel .uuid-panel-status {
      min-height: 16px;
      font-size: 11px;
      color: #a1a1aa;
      margin: 0;
    }
    #uuid-userscript-panel .uuid-panel-status.ok {
      color: #34d399;
    }
    #uuid-userscript-panel .uuid-panel-status.err {
      color: #f87171;
    }
    #uuid-userscript-panel .uuid-panel-regex-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: -2px;
    }
    #uuid-userscript-panel .uuid-panel-regex-row.hidden {
      display: none;
    }
    #uuid-userscript-panel .uuid-panel-regex {
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
    }
    #uuid-userscript-panel .uuid-panel-regex.invalid {
      border-color: #f87171;
      box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
    }
    #uuid-userscript-panel .uuid-panel-regex-error {
      font-size: 11px;
      color: #f87171;
      margin: -2px 0 0;
    }
    #uuid-userscript-panel .uuid-panel-regex-error.hidden {
      display: none;
    }

    /* ---- 浅色（白色）主题 ---- */
    html.us-theme-light #uuid-userscript-panel {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
      color: #1f2328;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-head {
      border-bottom-color: rgba(0, 0, 0, 0.12);
    }
    html.us-theme-light #uuid-userscript-panel label,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-status,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-close {
      color: #656d76;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-close:hover {
      background: rgba(0, 0, 0, 0.08);
      color: #1f2328;
    }
    html.us-theme-light #uuid-userscript-panel select,
    html.us-theme-light #uuid-userscript-panel input,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-code {
      background: #f6f8fa;
      border-color: rgba(0, 0, 0, 0.12);
      color: #1f2328;
    }
    html.us-theme-light #uuid-userscript-panel input::placeholder {
      color: #9ca3af;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-code {
      color: #4f46e5;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-copy {
      background: #eaeef2;
      border-color: rgba(0, 0, 0, 0.12);
      color: #1f2328;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-copy:hover {
      background: #e2e8f0;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-status.ok {
      color: #16a34a;
    }
    html.us-theme-light #uuid-userscript-panel .uuid-panel-status.err,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-error,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-regex-error {
      color: #dc2626;
    }
    html.us-theme-light #uuid-userscript-panel input.invalid,
    html.us-theme-light #uuid-userscript-panel .uuid-panel-regex.invalid {
      border-color: #dc2626;
    }
  `);

  // ---------- 启动 ----------

  loadSettings();
  applyTheme();
  buildPanel();
  syncFab();
  watchUrlChanges();
})();
