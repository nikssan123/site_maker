/**
 * Vanilla JS overlay injected into the preview iframe when edit mode is active.
 * Injected via iframe.contentDocument — no URL change, page stays on the same route.
 *
 * window.__editActive is toggled by the parent frame to enable/disable the interceptor.
 */
export const EDIT_OVERLAY_SCRIPT = `
(function () {
  if (window.__editOverlayInjected) return;
  window.__editOverlayInjected = true;

  var CARD_ID = '__edit-overlay-card';
  var BACKDROP_ID = '__edit-overlay-backdrop';

  // ── Hover highlight ──────────────────────────────────────────────────────────
  var _hlEl = null;
  var _hlSaved = {};
  // Overlay rect (div) used when we want to highlight a specific text-node range
  // rather than a whole element — e.g. when the element has inline <span> children.
  var _hlRect = null;

  function isEditable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.tagName === 'IMG') return true;
    // List containers aggregate text from all children — patching that blob always fails.
    // Individual items (LI, DT, DD) are still editable via the normal leaf check below.
    if (el.tagName === 'UL' || el.tagName === 'OL' || el.tagName === 'DL') return false;
    var hasText = el.textContent && el.textContent.trim().length > 0;
    return hasText && isLeafLike(el);
  }

  // True when the element contains element children (not just text nodes).
  // In that case we want to scope edits to a single text node to preserve inline JSX.
  function hasInlineChildElements(el) {
    if (!el || !el.childNodes) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 1) return true;
    }
    return false;
  }

  // Resolve the text node under a point, if any. Uses caretPositionFromPoint
  // (Firefox/modern) with a caretRangeFromPoint fallback (WebKit/Chromium).
  function textNodeFromPoint(x, y) {
    try {
      if (document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode && pos.offsetNode.nodeType === 3) return pos.offsetNode;
      } else if (document.caretRangeFromPoint) {
        var rng = document.caretRangeFromPoint(x, y);
        if (rng && rng.startContainer && rng.startContainer.nodeType === 3) return rng.startContainer;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  // Build a Range covering the entire text content of a text node.
  function rangeForTextNode(textNode) {
    var r = document.createRange();
    r.selectNodeContents(textNode);
    return r;
  }

  function applyHighlight(el) {
    if (_hlEl === el) return;
    clearHighlight();
    _hlEl = el;
    _hlSaved = {
      outline:       el.style.outline,
      outlineOffset: el.style.outlineOffset,
      cursor:        el.style.cursor,
      boxShadow:     el.style.boxShadow,
    };
    el.style.setProperty('outline',        '2px solid #6366f1', 'important');
    el.style.setProperty('outline-offset', '2px',               'important');
    el.style.setProperty('cursor',         'pointer',           'important');
    el.style.setProperty('box-shadow',     '0 0 0 4px rgba(99,102,241,.15)', 'important');
  }

  // Highlight a specific text node's bounding rect (overlay div, no layout impact).
  function applyRangeHighlight(textNode) {
    clearHighlight();
    try {
      var rect = rangeForTextNode(textNode).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      var div = document.createElement('div');
      div.setAttribute('data-edit-overlay-rect', '1');
      div.setAttribute('style',
        'all:initial!important;' +
        'position:fixed!important;' +
        'pointer-events:none!important;' +
        'z-index:2147483645!important;' +
        'left:' + (rect.left - 2) + 'px!important;' +
        'top:' + (rect.top - 2) + 'px!important;' +
        'width:' + (rect.width + 4) + 'px!important;' +
        'height:' + (rect.height + 4) + 'px!important;' +
        'border:2px solid #6366f1!important;' +
        'border-radius:4px!important;' +
        'box-shadow:0 0 0 4px rgba(99,102,241,.15)!important;'
      );
      document.body.appendChild(div);
      _hlRect = div;
      // Show pointer cursor on the parent element while the rect is up
      var parent = textNode.parentElement;
      if (parent) {
        _hlEl = parent;
        _hlSaved = { cursor: parent.style.cursor };
        parent.style.setProperty('cursor', 'pointer', 'important');
      }
    } catch (_) { /* ignore */ }
  }

  function clearHighlight() {
    if (_hlRect) {
      try { _hlRect.remove(); } catch (_) { /* ignore */ }
      _hlRect = null;
    }
    if (!_hlEl) return;
    if (_hlSaved.outline !== undefined)       _hlEl.style.outline       = _hlSaved.outline       || '';
    if (_hlSaved.outlineOffset !== undefined) _hlEl.style.outlineOffset = _hlSaved.outlineOffset || '';
    if (_hlSaved.cursor !== undefined)        _hlEl.style.cursor        = _hlSaved.cursor        || '';
    if (_hlSaved.boxShadow !== undefined)     _hlEl.style.boxShadow     = _hlSaved.boxShadow     || '';
    _hlEl = null;
    _hlSaved = {};
  }

  document.addEventListener('mousemove', function (e) {
    if (!window.__editActive) { clearHighlight(); return; }
    var card = document.getElementById(CARD_ID);
    if (card && card.contains(e.target)) { clearHighlight(); return; }
    if (!isEditable(e.target)) { clearHighlight(); return; }
    // If element has inline children (<span>, <a>, …), highlight only the text node
    // under the cursor — that's what we'll actually edit on click.
    if (e.target.tagName !== 'IMG' && hasInlineChildElements(e.target)) {
      var tn = textNodeFromPoint(e.clientX, e.clientY);
      if (tn && tn.nodeValue && tn.nodeValue.trim()) {
        applyRangeHighlight(tn);
        return;
      }
      // Cursor is over an inline child (e.g. directly on <span>). If that child
      // itself is an editable leaf we'll highlight it normally — otherwise clear.
      clearHighlight();
      return;
    }
    applyHighlight(e.target);
  }, true);

  document.addEventListener('mouseleave', function () {
    clearHighlight();
  });
  // ────────────────────────────────────────────────────────────────────────────

  function isLeafLike(el) {
    if (el.children.length === 0) return true;
    var inline = ['SPAN','A','STRONG','EM','B','I','BR','CODE','S','U','SMALL','MARK'];
    return Array.from(el.childNodes).every(function (n) {
      return n.nodeType === 3 || inline.indexOf(n.nodeName) !== -1;
    });
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function removeCard() {
    var c = document.getElementById(CARD_ID);
    if (c) c.remove();
    var b = document.getElementById(BACKDROP_ID);
    if (b) b.remove();
  }

  function showCard(target, isImg, explicitOriginal) {
    removeCard();
    clearHighlight(); // remove hover ring before the card opens
    var original;
    if (isImg) {
      original = target.getAttribute('src') || '';
    } else if (typeof explicitOriginal === 'string') {
      // Scoped edit: the original is a single text node's value (preserves inline siblings).
      original = explicitOriginal;
    } else {
      original = target.innerText.trim();
    }

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.setAttribute('style',
      'all:initial!important;' +
      'position:fixed!important;' +
      'inset:0!important;' +
      'z-index:2147483646!important;' +
      'background:rgba(0,0,0,.55)!important;' +
      'backdrop-filter:blur(3px)!important;' +
      '-webkit-backdrop-filter:blur(3px)!important;'
    );
    document.body.appendChild(backdrop);

    // Card
    var wrap = document.createElement('div');
    wrap.id = CARD_ID;
    wrap.setAttribute('style',
      'all:initial!important;' +
      'position:fixed!important;' +
      'z-index:2147483647!important;' +
      'top:50%!important;' +
      'left:50%!important;' +
      'transform:translate(-50%,-50%)!important;' +
      'width:420px!important;' +
      'max-width:calc(100vw - 32px)!important;' +
      'background:#18181b!important;' +
      'border:1px solid #3f3f46!important;' +
      'border-radius:16px!important;' +
      'box-shadow:0 0 0 1px rgba(99,102,241,.3),0 32px 80px rgba(0,0,0,.8)!important;' +
      'font-family:system-ui,-apple-system,sans-serif!important;' +
      'font-size:14px!important;' +
      'color:#f4f4f5!important;' +
      'box-sizing:border-box!important;' +
      'overflow:hidden!important;'
    );

    // Header bar
    var headerStyle =
      'display:flex!important;align-items:center!important;justify-content:space-between!important;' +
      'padding:16px 20px 14px!important;border-bottom:1px solid #27272a!important;';
    var titleStyle =
      'all:initial!important;font-family:system-ui,sans-serif!important;' +
      'font-size:15px!important;font-weight:700!important;color:#f4f4f5!important;letter-spacing:-.01em!important;';
    var typeChipStyle =
      'display:inline-block!important;padding:2px 10px!important;background:#27272a!important;' +
      'border-radius:99px!important;font-size:11px!important;font-weight:600!important;' +
      'color:#a1a1aa!important;letter-spacing:.03em!important;';
    var closeBtnStyle =
      'all:initial!important;width:28px!important;height:28px!important;display:flex!important;' +
      'align-items:center!important;justify-content:center!important;border-radius:8px!important;' +
      'background:transparent!important;cursor:pointer!important;color:#71717a!important;font-size:18px!important;' +
      'line-height:1!important;transition:background .15s!important;font-family:inherit!important;';

    // Body
    var bodyStyle = 'padding:20px!important;display:flex!important;flex-direction:column!important;gap:14px!important;';

    var inputStyle =
      'display:block!important;width:100%!important;box-sizing:border-box!important;' +
      'padding:10px 13px!important;background:#09090b!important;' +
      'border:1.5px solid #3f3f46!important;border-radius:10px!important;' +
      'color:#f4f4f5!important;font-size:14px!important;outline:none!important;' +
      'font-family:inherit!important;resize:vertical!important;line-height:1.55!important;' +
      'transition:border-color .15s!important;';

    var dividerRowStyle =
      'display:flex!important;align-items:center!important;gap:10px!important;';
    var dividerLineStyle =
      'flex:1!important;height:1px!important;background:#27272a!important;';
    var dividerTextStyle =
      'font-size:11px!important;color:#52525b!important;white-space:nowrap!important;';

    var uploadBtnStyle =
      'all:initial!important;display:flex!important;align-items:center!important;justify-content:center!important;' +
      'gap:7px!important;padding:10px 16px!important;' +
      'background:#09090b!important;border:1.5px dashed #4f46e5!important;' +
      'border-radius:10px!important;color:#818cf8!important;cursor:pointer!important;' +
      'font-size:13px!important;font-weight:600!important;font-family:system-ui,sans-serif!important;' +
      'width:100%!important;box-sizing:border-box!important;transition:border-color .15s,color .15s!important;';

    var previewImgStyle =
      'display:none!important;width:100%!important;height:160px!important;object-fit:cover!important;' +
      'border-radius:10px!important;border:1px solid #27272a!important;';

    var fileNameStyle =
      'display:none!important;font-size:11px!important;color:#71717a!important;text-align:center!important;';

    // Footer
    var footerStyle =
      'display:flex!important;gap:10px!important;justify-content:flex-end!important;' +
      'padding:14px 20px 18px!important;border-top:1px solid #27272a!important;';
    var cancelStyle =
      'all:initial!important;padding:9px 20px!important;background:#27272a!important;' +
      'border-radius:10px!important;color:#a1a1aa!important;cursor:pointer!important;' +
      'font-size:13px!important;font-weight:600!important;font-family:system-ui,sans-serif!important;' +
      'transition:background .15s!important;';
    var saveStyle =
      'all:initial!important;padding:9px 24px!important;' +
      'background:linear-gradient(135deg,#6366f1,#8b5cf6)!important;' +
      'border-radius:10px!important;color:#fff!important;cursor:pointer!important;' +
      'font-size:13px!important;font-weight:700!important;font-family:system-ui,sans-serif!important;' +
      'box-shadow:0 2px 12px rgba(99,102,241,.4)!important;' +
      'letter-spacing:.01em!important;';

    var typeLabel = isImg ? '🖼 Изображение' : '✏️ Текст';
    var inputHtml = isImg
      ? '<input id="__eo-input" type="url" style="' + inputStyle + '" value="' + escHtml(original) + '" placeholder="https://…">' +
        '<div style="' + dividerRowStyle + '"><span style="' + dividerLineStyle + '"></span><span style="' + dividerTextStyle + '">или качи файл</span><span style="' + dividerLineStyle + '"></span></div>' +
        '<label id="__eo-upload-label" style="' + uploadBtnStyle + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
          'Качи от компютъра' +
          '<input id="__eo-file" type="file" accept="image/*" style="display:none!important;">' +
        '</label>' +
        '<img id="__eo-preview" style="' + previewImgStyle + '" alt="">' +
        '<span id="__eo-file-name" style="' + fileNameStyle + '"></span>'
      : '<textarea id="__eo-input" rows="5" style="' + inputStyle + '">' + escHtml(original) + '</textarea>';

    wrap.innerHTML =
      '<div style="' + headerStyle + '">' +
        '<span style="' + titleStyle + '">Редактиране</span>' +
        '<span style="' + typeChipStyle + '">' + typeLabel + '</span>' +
        '<button id="__eo-close" style="' + closeBtnStyle + '">✕</button>' +
      '</div>' +
      '<div style="' + bodyStyle + '">' + inputHtml + '</div>' +
      '<div style="' + footerStyle + '">' +
        '<button id="__eo-cancel" style="' + cancelStyle + '">Отказ</button>' +
        '<button id="__eo-save" style="' + saveStyle + '">Запази промените</button>' +
      '</div>';

    document.body.appendChild(wrap);

    var input = document.getElementById('__eo-input');
    if (input) {
      input.focus();
      // Prevent app keydown handlers (e.g. Escape-to-close-modal) from interfering while typing
      input.addEventListener('keydown', function(e) { e.stopPropagation(); });
    }

    // File upload handling for image cards
    var _pendingDataUrl = null;
    var _pendingFilename = null;
    if (isImg) {
      var fileInput = document.getElementById('__eo-file');
      if (fileInput) {
        fileInput.addEventListener('change', function(e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          // Show filename
          var nameEl = document.getElementById('__eo-file-name');
          if (nameEl) { nameEl.style.setProperty('display', 'block', 'important'); nameEl.textContent = file.name; }
          // Preview
          var reader = new FileReader();
          reader.onload = function(ev) {
            _pendingDataUrl = ev.target.result;
            _pendingFilename = file.name;
            var prev = document.getElementById('__eo-preview');
            if (prev) { prev.src = _pendingDataUrl; prev.style.setProperty('display', 'block', 'important'); }
            // Clear the URL input so it's obvious the file takes priority
            var urlInput = document.getElementById('__eo-input');
            if (urlInput) urlInput.value = '';
          };
          reader.readAsDataURL(file);
        });
      }
    }

    // Focus ring on input
    var inputEl = document.getElementById('__eo-input');
    if (inputEl) {
      inputEl.addEventListener('focus', function() {
        this.style.setProperty('border-color', '#6366f1', 'important');
        this.style.setProperty('box-shadow', '0 0 0 3px rgba(99,102,241,.2)', 'important');
      });
      inputEl.addEventListener('blur', function() {
        this.style.setProperty('border-color', '#3f3f46', 'important');
        this.style.setProperty('box-shadow', 'none', 'important');
      });
    }

    // Close via X button or backdrop click
    var closeBtn = document.getElementById('__eo-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) { e.stopPropagation(); removeCard(); });
    }
    backdrop.addEventListener('click', function(e) { e.stopPropagation(); removeCard(); });

    document.getElementById('__eo-cancel').addEventListener('click', function(e) {
      e.stopPropagation();
      removeCard();
    });

    document.getElementById('__eo-save').addEventListener('click', function(e) {
      e.stopPropagation();
      var inp = document.getElementById('__eo-input');
      var replacement = inp ? inp.value : original;
      var patch = { original: original, replacement: replacement, isImg: isImg };
      // If user picked a file, send the data URL for the parent to upload
      if (_pendingDataUrl) {
        patch.imageDataUrl = _pendingDataUrl;
        patch.imageFilename = _pendingFilename || 'image.jpg';
        patch.replacement = null; // parent will fill in after upload
      }
      window.parent.postMessage({ type: 'EDIT_SAVED', patch: patch }, window.location.origin || '*');
      removeCard();
    });
  }

  // Capture-phase click — intercepts before React.
  // Only close the card when the user clicks a *new* editable target (opens replacement card)
  // or explicitly on Cancel. Non-editable clicks are swallowed but the card stays open.
  document.addEventListener('click', function (e) {
    if (!window.__editActive) { removeCard(); return; }

    var card = document.getElementById(CARD_ID);
    var bd = document.getElementById(BACKDROP_ID);
    // Let card-internal clicks and backdrop clicks handle themselves
    if (card && card.contains(e.target)) return;
    if (bd && bd === e.target) return;

    // Always intercept — prevent React handlers / navigation while in edit mode
    e.preventDefault();
    e.stopPropagation();

    var t = e.target;
    if (!t || t === document.body || t === document.documentElement) return;

    var isImg = t.tagName === 'IMG';
    var hasText = !isImg && t.textContent && t.textContent.trim().length > 0;
    var isText = hasText && isLeafLike(t);

    if (!isImg && !isText) {
      // Non-editable click: swallowed (keeps edit mode active) but DON'T close card
      return;
    }

    // If element has inline children, scope the edit to the single text node under the cursor.
    if (!isImg && hasInlineChildElements(t)) {
      var tn = textNodeFromPoint(e.clientX, e.clientY);
      if (tn && tn.nodeValue && tn.nodeValue.trim()) {
        // Pass the exact text node content (trimmed of leading/trailing whitespace
        // only — interior whitespace is preserved to match source JSXText).
        showCard(t, false, tn.nodeValue.replace(/^\s+|\s+$/g, ''));
        return;
      }
      // No text node under the cursor (clicked gap between children) — ignore.
      return;
    }

    // New editable target — open card for it (replaces any existing card)
    showCard(t, isImg);
  }, true);

  // Escape key closes card
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var card = document.getElementById(CARD_ID);
      if (card) { e.stopPropagation(); removeCard(); }
    }
  }, true);

  // When edit mode is turned off externally, clear any lingering highlight
  Object.defineProperty(window, '__editActive', {
    get: function () { return window.__editActiveValue; },
    set: function (v) {
      window.__editActiveValue = v;
      if (!v) { clearHighlight(); removeCard(); }
    },
    configurable: true,
  });
})();
`;
