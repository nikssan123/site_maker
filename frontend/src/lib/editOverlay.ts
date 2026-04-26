/**
 * Vanilla JS overlay injected into the preview iframe in edit mode.
 *
 * Responsibilities split:
 *   - This script stays in the iframe to do the things only a local document can do:
 *     hover detection, click capture, text-node-at-point resolution, icon fingerprinting,
 *     contentEditable wiring, drag-to-resize handles, and optimistic DOM mutations.
 *   - The floating toolbar UI is rendered by the parent React app and positioned over the
 *     iframe using the rect we report back via EDIT_SELECT / EDIT_SELECTION_RECT.
 *
 * Protocol:
 *   iframe → parent:
 *     { type: 'EDIT_SELECT', target, rect }     — click on an editable element
 *     { type: 'EDIT_SELECTION_RECT', rect }     — re-emit on iframe scroll/resize so toolbar follows
 *     { type: 'EDIT_DESELECT' }                 — click on empty space
 *     { type: 'EDIT_DYNAMIC_BLOCKED', target }  — element is server-driven, edit refused
 *     { type: 'EDIT_TEXT_INPUT', anchor, value }   — debounced contentEditable input
 *     { type: 'EDIT_TEXT_COMMIT', anchor, value }  — contentEditable blur or Enter
 *     { type: 'EDIT_IMAGE_RESIZE', anchor, width, height }  — drag handle release
 *     { type: 'EDIT_ESCAPE' }                   — Escape pressed in iframe
 *
 *   parent → iframe (all wrapped as { type: 'EDIT_APPLY', op, ... } except where noted):
 *     replace-text, replace-image, replace-icon-{preview,image}, delete-{text,image,icon}
 *     image-attrs (live preview of width/height/borderRadius)
 *     { type: 'EDIT_BEGIN_TEXT', anchor }       — start contentEditable
 *     { type: 'EDIT_END_TEXT' }                 — exit contentEditable
 *     { type: 'EDIT_DESELECT' }                 — clear persistent selection ring
 *
 * window.__editActive toggles the interceptor without reloading the iframe.
 */
export const EDIT_OVERLAY_SCRIPT = `
(function () {
  if (window.__editOverlayInjected) return;
  window.__editOverlayInjected = true;

  var SELECTION_ID = '__edit-overlay-selection';
  var PERSIST_ID = '__edit-overlay-persist';
  var HANDLES_ID = '__edit-overlay-handles';
  var DYNAMIC_ATTR = 'data-appmaker-dynamic';

  // Persistent selection: which element is currently being edited (separate from hover).
  // { kind: 'text'|'image'|'icon', element: Node, anchor?: string, sourcePathD?: string }
  var currentSelection = null;
  // contentEditable bookkeeping so we can clean up listeners on EDIT_END_TEXT.
  var activeEditable = null; // { el, originalText, anchor, onInput, onBlur, onKey, debouncer }

  // ── Editable detection ────────────────────────────────────────────────────
  function isEditable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.tagName === 'IMG') return true;
    if (findOwningIconSvg(el)) return true;
    if (el.tagName === 'UL' || el.tagName === 'OL' || el.tagName === 'DL') return false;
    var hasText = el.textContent && el.textContent.trim().length > 0;
    return hasText && isLeafLike(el);
  }

  function isLeafLike(el) {
    if (el.children.length === 0) return true;
    var inline = ['SPAN','A','STRONG','EM','B','I','BR','CODE','S','U','SMALL','MARK'];
    return Array.from(el.childNodes).every(function (n) {
      return n.nodeType === 3 || inline.indexOf(n.nodeName) !== -1;
    });
  }

  function hasInlineChildElements(el) {
    if (!el || !el.childNodes) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 1) return true;
    }
    return false;
  }

  function findOwningIconSvg(el) {
    var cur = el;
    for (var i = 0; cur && i < 4; i++) {
      if (cur.nodeType === 1 && cur.tagName && cur.tagName.toLowerCase() === 'svg') {
        var cls = cur.getAttribute('class') || '';
        if (cls.indexOf('MuiSvgIcon-root') !== -1) return cur;
      }
      cur = cur.parentNode;
    }
    return null;
  }

  function getIconPathD(svg) {
    if (!svg) return '';
    var p = svg.querySelector('path');
    return p ? (p.getAttribute('d') || '') : '';
  }

  function findDynamicOwner(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement : el;
    for (var i = 0; cur && i < 8; i++) {
      if (cur.nodeType === 1 && cur.getAttribute && cur.getAttribute(DYNAMIC_ATTR) === 'true') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function dynamicMeta(el) {
    return {
      model: el && el.getAttribute ? (el.getAttribute('data-appmaker-model') || undefined) : undefined,
      field: el && el.getAttribute ? (el.getAttribute('data-appmaker-field') || undefined) : undefined,
      id: el && el.getAttribute ? (el.getAttribute('data-appmaker-id') || undefined) : undefined,
    };
  }

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

  function rectForTarget(target) {
    if (!target) return null;
    if (target.nodeType === 3) {
      try {
        var r = document.createRange();
        r.selectNodeContents(target);
        return r.getBoundingClientRect();
      } catch (_) { return null; }
    }
    try { return target.getBoundingClientRect(); } catch (_) { return null; }
  }

  function rectMessage(rect) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  // ── Selection ring (hover) ────────────────────────────────────────────────
  function drawSelectionRing(rect, blocked) {
    clearSelectionRing();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    var color = blocked ? '#f59e0b' : '#6366f1';
    var shadow = blocked ? 'rgba(245,158,11,.22)' : 'rgba(99,102,241,.15)';
    var div = document.createElement('div');
    div.id = SELECTION_ID;
    div.setAttribute('style',
      'all:initial!important;' +
      'position:fixed!important;' +
      'pointer-events:none!important;' +
      'z-index:2147483645!important;' +
      'left:' + (rect.left - 3) + 'px!important;' +
      'top:' + (rect.top - 3) + 'px!important;' +
      'width:' + (rect.width + 6) + 'px!important;' +
      'height:' + (rect.height + 6) + 'px!important;' +
      'border:2px solid ' + color + '!important;' +
      'border-radius:6px!important;' +
      'box-shadow:0 0 0 4px ' + shadow + '!important;' +
      'transition:left .08s ease-out, top .08s ease-out, width .08s ease-out, height .08s ease-out!important;'
    );
    if (blocked) {
      div.textContent = window.__editDynamicMessage || 'Managed in catalog';
      div.style.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
      div.style.color = '#111827';
      div.style.background = 'rgba(245,158,11,.94)';
      div.style.padding = '3px 7px';
      div.style.height = 'auto';
      div.style.minHeight = (rect.height + 6) + 'px';
      div.style.display = 'flex';
      div.style.alignItems = 'flex-start';
      div.style.justifyContent = 'flex-start';
    }
    document.body.appendChild(div);
  }

  function clearSelectionRing() {
    var el = document.getElementById(SELECTION_ID);
    if (el) el.remove();
    if (!activeEditable) document.body.style.cursor = '';
  }

  // ── Persistent selection ring (sticky after click) + resize handles ───────
  function drawPersistentSelection() {
    var existing = document.getElementById(PERSIST_ID);
    if (existing) existing.remove();
    var handles = document.getElementById(HANDLES_ID);
    if (handles) handles.remove();
    if (!currentSelection) return;
    var rect = rectForTarget(currentSelection.element);
    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    var ring = document.createElement('div');
    ring.id = PERSIST_ID;
    ring.setAttribute('style',
      'all:initial!important;' +
      'position:fixed!important;' +
      'pointer-events:none!important;' +
      'z-index:2147483644!important;' +
      'left:' + (rect.left - 2) + 'px!important;' +
      'top:' + (rect.top - 2) + 'px!important;' +
      'width:' + (rect.width + 4) + 'px!important;' +
      'height:' + (rect.height + 4) + 'px!important;' +
      'border:1.5px solid #6366f1!important;' +
      'border-radius:4px!important;'
    );
    document.body.appendChild(ring);

    if (currentSelection.kind === 'image' || currentSelection.kind === 'icon') {
      drawResizeHandles(rect);
    }
  }

  function clearPersistentSelection() {
    var el = document.getElementById(PERSIST_ID);
    if (el) el.remove();
    var handles = document.getElementById(HANDLES_ID);
    if (handles) handles.remove();
  }

  function drawResizeHandles(rect) {
    var container = document.createElement('div');
    container.id = HANDLES_ID;
    container.setAttribute('style',
      'all:initial!important;' +
      'position:fixed!important;' +
      'pointer-events:none!important;' +
      'z-index:2147483646!important;' +
      'left:' + (rect.left - 6) + 'px!important;' +
      'top:' + (rect.top - 6) + 'px!important;' +
      'width:' + (rect.width + 12) + 'px!important;' +
      'height:' + (rect.height + 12) + 'px!important;'
    );
    var corners = [
      { x: 0,   y: 0,   c: 'nwse-resize', dx: -1, dy: -1 },
      { x: 1,   y: 0,   c: 'nesw-resize', dx:  1, dy: -1 },
      { x: 0,   y: 1,   c: 'nesw-resize', dx: -1, dy:  1 },
      { x: 1,   y: 1,   c: 'nwse-resize', dx:  1, dy:  1 },
    ];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      var h = document.createElement('div');
      h.setAttribute('data-handle-dx', String(c.dx));
      h.setAttribute('data-handle-dy', String(c.dy));
      h.setAttribute('style',
        'all:initial!important;' +
        'position:absolute!important;' +
        'width:12px!important;height:12px!important;' +
        'background:#fff!important;' +
        'border:2px solid #6366f1!important;' +
        'border-radius:50%!important;' +
        'pointer-events:auto!important;' +
        'cursor:' + c.c + '!important;' +
        'left:' + (c.x ? 'calc(100% - 6px)' : '-6px') + '!important;' +
        'top:'  + (c.y ? 'calc(100% - 6px)' : '-6px') + '!important;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.25)!important;'
      );
      h.addEventListener('mousedown', startResize, true);
      container.appendChild(h);
    }
    document.body.appendChild(container);
  }

  function startResize(ev) {
    if (!currentSelection || (currentSelection.kind !== 'image' && currentSelection.kind !== 'icon')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var dx = parseFloat(ev.currentTarget.getAttribute('data-handle-dx')) || 0;
    var dy = parseFloat(ev.currentTarget.getAttribute('data-handle-dy')) || 0;
    var startRect = rectForTarget(currentSelection.element);
    if (!startRect) return;
    var startW = startRect.width;
    var startH = startRect.height;
    var startX = ev.clientX;
    var startY = ev.clientY;
    var aspect = startH > 0 ? startW / startH : 1;

    function onMove(e) {
      var deltaX = (e.clientX - startX) * dx;
      var deltaY = (e.clientY - startY) * dy;
      var newW = Math.max(16, Math.round(startW + deltaX));
      var newH = Math.max(16, Math.round(startH + deltaY));
      // Hold shift to break aspect; default to locked aspect.
      if (!e.shiftKey) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          newH = Math.max(16, Math.round(newW / aspect));
        } else {
          newW = Math.max(16, Math.round(newH * aspect));
        }
      }
      currentSelection.element.style.width = newW + 'px';
      currentSelection.element.style.height = newH + 'px';
      drawPersistentSelection();
    }
    function onUp(e) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      var finalRect = rectForTarget(currentSelection.element);
      if (finalRect && currentSelection.kind === 'image' && currentSelection.anchor) {
        postToParent({
          type: 'EDIT_IMAGE_RESIZE',
          anchor: currentSelection.anchor,
          width: Math.round(finalRect.width) + 'px',
          height: Math.round(finalRect.height) + 'px',
        });
      }
      // Icons: width/height styling for SVGs is tricky and seldom what users want — skip persist.
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  document.addEventListener('mousemove', function (e) {
    if (!window.__editActive) { clearSelectionRing(); return; }
    if (activeEditable) return; // don't show hover ring while editing text
    if (!isEditable(e.target)) { clearSelectionRing(); return; }
    document.body.style.cursor = 'pointer';
    var dyn = findDynamicOwner(e.target);
    var iconSvg = findOwningIconSvg(e.target);
    if (iconSvg) { drawSelectionRing(rectForTarget(iconSvg), !!dyn); return; }
    if (e.target.tagName !== 'IMG' && hasInlineChildElements(e.target)) {
      var tn = textNodeFromPoint(e.clientX, e.clientY);
      if (tn && tn.nodeValue && tn.nodeValue.trim()) {
        drawSelectionRing(rectForTarget(tn), !!dyn || !!findDynamicOwner(tn));
        return;
      }
      clearSelectionRing();
      return;
    }
    drawSelectionRing(rectForTarget(e.target), !!dyn);
  }, true);

  document.addEventListener('mouseleave', function () { clearSelectionRing(); });
  window.addEventListener('scroll', function () {
    clearSelectionRing();
    sendSelectionRect();
    drawPersistentSelection();
  }, true);
  window.addEventListener('resize', function () {
    sendSelectionRect();
    drawPersistentSelection();
  }, true);

  function sendSelectionRect() {
    if (!currentSelection) return;
    var rect = rectForTarget(currentSelection.element);
    if (!rect) return;
    postToParent({ type: 'EDIT_SELECTION_RECT', rect: rectMessage(rect) });
  }

  // ── Click → postMessage ───────────────────────────────────────────────────
  function postToParent(msg) {
    try {
      window.parent.postMessage(msg, window.location.origin || '*');
    } catch (_) { /* ignore */ }
  }

  document.addEventListener('click', function (e) {
    if (!window.__editActive) return;

    // While editing text, let the user click within the contentEditable freely; only intercept
    // outside clicks (which act as commit-and-dismiss).
    if (activeEditable) {
      if (activeEditable.el.contains(e.target)) return;
      // outside click — blur the editable, which will fire EDIT_TEXT_COMMIT.
      activeEditable.el.blur();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    var t = e.target;
    if (!t || t === document.body || t === document.documentElement) {
      currentSelection = null;
      clearPersistentSelection();
      postToParent({ type: 'EDIT_DESELECT' });
      return;
    }

    var dynamicOwner = findDynamicOwner(t);
    if (dynamicOwner) {
      postToParent({ type: 'EDIT_DYNAMIC_BLOCKED', target: dynamicMeta(dynamicOwner) });
      return;
    }

    // Icon click
    var iconSvg = findOwningIconSvg(t);
    if (iconSvg) {
      // If we previously swapped this icon locally, prefer the original source-side path-d
      // so the backend can still find it (the source file hasn't been rewritten yet).
      var pathD = iconSvg.getAttribute('data-original-path-d') || getIconPathD(iconSvg);
      if (pathD) {
        var iRect = iconSvg.getBoundingClientRect();
        currentSelection = {
          kind: 'icon',
          element: iconSvg,
          sourcePathD: pathD,
        };
        drawPersistentSelection();
        postToParent({
          type: 'EDIT_SELECT',
          target: {
            kind: 'icon',
            sourcePathD: pathD,
            width: Math.round(iRect.width) || 24,
            height: Math.round(iRect.height) || 24,
          },
          rect: rectMessage(iRect),
        });
      }
      return;
    }

    var isImg = t.tagName === 'IMG';
    var hasText = !isImg && t.textContent && t.textContent.trim().length > 0;
    var isText = hasText && isLeafLike(t);

    if (!isImg && !isText) return;

    if (isImg) {
      var imgRect = t.getBoundingClientRect();
      var src = t.getAttribute('src') || '';
      currentSelection = { kind: 'image', element: t, anchor: src };
      drawPersistentSelection();
      postToParent({
        type: 'EDIT_SELECT',
        target: { kind: 'image', anchor: src },
        rect: rectMessage(imgRect),
      });
      return;
    }

    // Text. If the element has inline children, scope the anchor to the text node under cursor.
    var anchor;
    var styleSource;
    var anchorElement;
    if (hasInlineChildElements(t)) {
      var tn = textNodeFromPoint(e.clientX, e.clientY);
      if (!tn || !tn.nodeValue || !tn.nodeValue.trim()) return;
      anchor = tn.nodeValue.replace(/^\\s+|\\s+$/g, '');
      styleSource = tn.parentElement;
      anchorElement = tn.parentElement || t;
    } else {
      anchor = t.innerText.trim();
      styleSource = t;
      anchorElement = t;
    }
    var cs = styleSource ? window.getComputedStyle(styleSource) : null;
    var textRect = rectForTarget(anchorElement) || t.getBoundingClientRect();
    currentSelection = { kind: 'text', element: anchorElement, anchor: anchor };
    drawPersistentSelection();
    postToParent({
      type: 'EDIT_SELECT',
      target: {
        kind: 'text',
        anchor: anchor,
        style: cs ? snapshotStyleFromComputed(cs) : undefined,
      },
      rect: rectMessage(textRect),
    });
  }, true);

  function rgbToHex(color) {
    var m = String(color || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return undefined;
    function h(n) { return Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'); }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  /**
   * Build a style snapshot from computed style — but only with values that the backend's
   * TextStyleSchema (zod) accepts. Computed style returns logical values like 'start'/'end' for
   * text-align and 'normal' for line-height that would otherwise fail validation on save.
   */
  function snapshotStyleFromComputed(cs) {
    var out = {
      bold: parseInt(cs.fontWeight || '400', 10) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: (cs.textDecorationLine || cs.textDecoration || '').indexOf('underline') !== -1,
    };
    if (cs.fontSize && /^\\d{1,4}(\\.\\d+)?(px|rem|em|%)$/.test(cs.fontSize)) {
      out.fontSize = cs.fontSize;
    }
    if (cs.fontFamily && /^[\\w\\s"',.-]+$/.test(cs.fontFamily)) {
      out.fontFamily = cs.fontFamily;
    }
    var col = rgbToHex(cs.color);
    if (col) out.color = col;
    var ta = cs.textAlign;
    // CSS logical values 'start'/'end' map to left/right under LTR (the assumption here).
    if (ta === 'start' || ta === 'left') out.textAlign = 'left';
    else if (ta === 'end' || ta === 'right') out.textAlign = 'right';
    else if (ta === 'center' || ta === 'justify') out.textAlign = ta;
    if (cs.lineHeight && /^(\\d+(\\.\\d+)?|\\d{1,4}(\\.\\d+)?(px|rem|em|%))$/.test(cs.lineHeight)) {
      out.lineHeight = cs.lineHeight;
    }
    if (cs.letterSpacing && /^-?\\d{1,3}(\\.\\d+)?(px|rem|em)$/.test(cs.letterSpacing)) {
      out.letterSpacing = cs.letterSpacing;
    }
    return out;
  }

  // ── contentEditable wiring ───────────────────────────────────────────────
  function startEditingText(anchor) {
    if (activeEditable) endEditingText(false);
    var tn = findTextNodeByValue(anchor);
    if (!tn || !tn.parentElement) return;
    var el = tn.parentElement;
    // Refuse if the parent has inline children — mutating contentEditable on it would re-flow
    // and risk breaking the React hydration. The toolbar will fall back to a TextField.
    if (hasInlineChildElements(el)) {
      postToParent({ type: 'EDIT_TEXT_INPUT', anchor: anchor, value: tn.nodeValue || '', refused: true });
      return;
    }

    var originalText = el.textContent || '';
    el.setAttribute('contenteditable', 'true');
    el.style.outline = '2px dashed #6366f1';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'text';
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) { /* ignore */ }

    var debouncer;
    function onInput() {
      clearTimeout(debouncer);
      debouncer = setTimeout(function () {
        postToParent({ type: 'EDIT_TEXT_INPUT', anchor: anchor, value: el.textContent || '' });
      }, 120);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        el.textContent = originalText;
        endEditingText(true);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        endEditingText(false);
      }
    }
    function onBlur() {
      endEditingText(false);
    }

    activeEditable = { el: el, originalText: originalText, anchor: anchor, onInput: onInput, onBlur: onBlur, onKey: onKey };
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  function endEditingText(reverted) {
    if (!activeEditable) return;
    var rec = activeEditable;
    activeEditable = null;
    rec.el.removeEventListener('input', rec.onInput);
    rec.el.removeEventListener('blur', rec.onBlur);
    rec.el.removeEventListener('keydown', rec.onKey);
    rec.el.removeAttribute('contenteditable');
    rec.el.style.outline = '';
    rec.el.style.outlineOffset = '';
    rec.el.style.cursor = '';
    var finalText = reverted ? rec.originalText : (rec.el.textContent || '');
    postToParent({ type: 'EDIT_TEXT_COMMIT', anchor: rec.anchor, value: finalText, reverted: !!reverted });
  }

  // ── Optimistic DOM mutations (EDIT_APPLY) ─────────────────────────────────
  function findTextNodeByValue(anchor) {
    var needle = (anchor || '').replace(/^\\s+|\\s+$/g, '');
    if (!needle) return null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').replace(/^\\s+|\\s+$/g, '') === needle) return n;
    }
    return null;
  }

  function findImageBySrc(anchor) {
    if (!anchor) return null;
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getAttribute('src') === anchor || imgs[i].src === anchor) return imgs[i];
    }
    return null;
  }

  function findIconBySourcePathD(pathD) {
    if (!pathD) return null;
    var svgs = document.querySelectorAll('svg.MuiSvgIcon-root');
    for (var i = 0; i < svgs.length; i++) {
      var p = svgs[i].querySelector('path');
      var current = p ? (p.getAttribute('d') || '') : '';
      // After an in-place swap the rendered d differs from the source d; keep both lookups
      // working until the next rebuild via the remembered original.
      var original = svgs[i].getAttribute('data-original-path-d') || '';
      if (current === pathD || original === pathD) return svgs[i];
    }
    return null;
  }

  function applyStyleToElement(el, style) {
    if (!el || !style) return;
    if (style.bold !== undefined) el.style.fontWeight = style.bold ? '700' : '';
    if (style.italic !== undefined) el.style.fontStyle = style.italic ? 'italic' : '';
    if (style.underline !== undefined) el.style.textDecoration = style.underline ? 'underline' : '';
    if (style.fontSize) el.style.fontSize = style.fontSize;
    if (style.fontFamily) el.style.fontFamily = style.fontFamily;
    if (style.color) el.style.color = style.color;
    if (style.textAlign) el.style.textAlign = style.textAlign;
    if (style.lineHeight) el.style.lineHeight = style.lineHeight;
    if (style.letterSpacing) el.style.letterSpacing = style.letterSpacing;
    if (style.padding) el.style.padding = style.padding;
    if (style.margin) el.style.margin = style.margin;
    if (style.background) el.style.background = style.background;
    if (style.borderRadius) el.style.borderRadius = style.borderRadius;
  }

  function applyOp(msg) {
    try {
      if (msg.op === 'replace-text') {
        // After the user has edited text in-place via contentEditable, the iframe text node
        // already holds the new value — anchor lookup fails. Fall back to the replacement so
        // subsequent style toggles still hit the right node.
        var tn = findTextNodeByValue(msg.anchor) || findTextNodeByValue(msg.replacement);
        if (!tn) return;
        var leading = (tn.nodeValue || '').match(/^\\s*/)[0];
        var trailing = (tn.nodeValue || '').match(/\\s*$/)[0];
        tn.nodeValue = leading + msg.replacement + trailing;
        applyStyleToElement(tn.parentElement, msg.style);
      } else if (msg.op === 'apply-style') {
        // Live style preview without changing text. anchor identifies the element by its text.
        var tn2 = findTextNodeByValue(msg.anchor);
        if (tn2) applyStyleToElement(tn2.parentElement, msg.style);
      } else if (msg.op === 'replace-image') {
        var img = findImageBySrc(msg.anchor);
        if (img) img.setAttribute('src', msg.replacement);
      } else if (msg.op === 'image-attrs') {
        var img4 = findImageBySrc(msg.anchor);
        if (img4) {
          if (msg.width) img4.style.width = msg.width;
          if (msg.height) img4.style.height = msg.height;
          if (msg.borderRadius) img4.style.borderRadius = msg.borderRadius;
          drawPersistentSelection();
        }
      } else if (msg.op === 'replace-icon-preview') {
        var svg = findIconBySourcePathD(msg.sourcePathD);
        if (svg) {
          if (msg.newPathD) {
            var p = svg.querySelector('path');
            if (p) {
              // Remember the source-side path-d so future clicks on this same SVG (after a
              // local swap but before rebuild) still resolve to the right source anchor.
              if (!svg.getAttribute('data-original-path-d')) {
                svg.setAttribute('data-original-path-d', msg.sourcePathD);
              }
              p.setAttribute('d', msg.newPathD);
            }
            svg.style.opacity = '';
          } else {
            // Fallback: dim the icon to indicate a pending change we can't preview locally.
            svg.style.opacity = '0.5';
          }
        }
      } else if (msg.op === 'replace-icon-image') {
        var svg2 = findIconBySourcePathD(msg.sourcePathD);
        if (svg2 && svg2.parentNode) {
          var img2 = document.createElement('img');
          img2.setAttribute('src', msg.url);
          img2.setAttribute('alt', '');
          img2.setAttribute('width', String(msg.width || 24));
          img2.setAttribute('height', String(msg.height || 24));
          img2.style.verticalAlign = 'middle';
          svg2.parentNode.replaceChild(img2, svg2);
        }
      } else if (msg.op === 'delete-text') {
        var tn3 = findTextNodeByValue(msg.anchor);
        if (tn3 && tn3.parentNode) tn3.parentNode.removeChild(tn3);
      } else if (msg.op === 'delete-image') {
        var img3 = findImageBySrc(msg.anchor);
        if (img3 && img3.parentNode) img3.parentNode.removeChild(img3);
      } else if (msg.op === 'delete-icon') {
        var svg3 = findIconBySourcePathD(msg.sourcePathD);
        if (svg3 && svg3.parentNode) svg3.parentNode.removeChild(svg3);
      }
    } catch (_) { /* ignore */ }
  }

  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'EDIT_APPLY') { applyOp(e.data); return; }
    if (e.data.type === 'EDIT_BEGIN_TEXT' && e.data.anchor) { startEditingText(e.data.anchor); return; }
    if (e.data.type === 'EDIT_END_TEXT') { endEditingText(false); return; }
    if (e.data.type === 'EDIT_DESELECT') {
      currentSelection = null;
      clearPersistentSelection();
      return;
    }
  });

  // ── Escape key propagation block (keep parent toolbar usable) ─────────────
  document.addEventListener('keydown', function (e) {
    if (!window.__editActive) return;
    if (e.key === 'Escape') {
      if (activeEditable) return; // contentEditable handles its own escape
      postToParent({ type: 'EDIT_ESCAPE' });
    }
  }, true);

  // ── Toggle plumbing ───────────────────────────────────────────────────────
  Object.defineProperty(window, '__editActive', {
    get: function () { return window.__editActiveValue; },
    set: function (v) {
      window.__editActiveValue = v;
      if (!v) {
        clearSelectionRing();
        clearPersistentSelection();
        currentSelection = null;
        if (activeEditable) endEditingText(true);
      }
    },
    configurable: true,
  });
})();
`;
