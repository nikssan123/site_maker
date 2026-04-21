/**
 * Vanilla JS overlay injected into the preview iframe in edit mode.
 *
 * Responsibilities split:
 *   - This script stays in the iframe to do the things only a local document can do:
 *     hover detection, click capture, text-node-at-point resolution, icon fingerprinting,
 *     and optimistic DOM mutations.
 *   - All UI chrome (edit card, pickers) is rendered by the parent React app.
 *
 * Protocol:
 *   iframe → parent: { type: 'EDIT_SELECT', target } on click of an editable element.
 *   parent → iframe: { type: 'EDIT_APPLY', op, ... } with the confirmed patch, applied
 *                    optimistically to the DOM so the user sees the change immediately.
 *
 * window.__editActive toggles the interceptor without reloading the iframe.
 */
export const EDIT_OVERLAY_SCRIPT = `
(function () {
  if (window.__editOverlayInjected) return;
  window.__editOverlayInjected = true;

  var SELECTION_ID = '__edit-overlay-selection';
  var DYNAMIC_ATTR = 'data-appmaker-dynamic';

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
    // target is an Element or a Text node; produce a DOMRect-ish.
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

  // ── Selection ring (pure overlay div, never mutates target styles) ────────
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
    document.body.style.cursor = '';
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  document.addEventListener('mousemove', function (e) {
    if (!window.__editActive) { clearSelectionRing(); return; }
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
  window.addEventListener('scroll', function () { clearSelectionRing(); }, true);

  // ── Click → postMessage ───────────────────────────────────────────────────
  function postToParent(msg) {
    try {
      window.parent.postMessage(msg, window.location.origin || '*');
    } catch (_) { /* ignore */ }
  }

  document.addEventListener('click', function (e) {
    if (!window.__editActive) return;

    // Intercept everything in edit mode — stop React/nav handlers.
    e.preventDefault();
    e.stopPropagation();

    var t = e.target;
    if (!t || t === document.body || t === document.documentElement) return;

    var dynamicOwner = findDynamicOwner(t);
    if (dynamicOwner) {
      postToParent({ type: 'EDIT_DYNAMIC_BLOCKED', target: dynamicMeta(dynamicOwner) });
      return;
    }

    // Icon click
    var iconSvg = findOwningIconSvg(t);
    if (iconSvg) {
      var pathD = getIconPathD(iconSvg);
      if (pathD) {
        var rect = iconSvg.getBoundingClientRect();
        postToParent({
          type: 'EDIT_SELECT',
          target: {
            kind: 'icon',
            sourcePathD: pathD,
            width: Math.round(rect.width) || 24,
            height: Math.round(rect.height) || 24,
          },
        });
      }
      return;
    }

    var isImg = t.tagName === 'IMG';
    var hasText = !isImg && t.textContent && t.textContent.trim().length > 0;
    var isText = hasText && isLeafLike(t);

    if (!isImg && !isText) return;

    if (isImg) {
      postToParent({
        type: 'EDIT_SELECT',
        target: { kind: 'image', anchor: t.getAttribute('src') || '' },
      });
      return;
    }

    // Text: if element has inline children, scope to the text node under the cursor.
    var anchor;
    if (hasInlineChildElements(t)) {
      var tn = textNodeFromPoint(e.clientX, e.clientY);
      if (!tn || !tn.nodeValue || !tn.nodeValue.trim()) return;
      anchor = tn.nodeValue.replace(/^\\s+|\\s+$/g, '');
    } else {
      anchor = t.innerText.trim();
    }
    var styleSource = hasInlineChildElements(t) && tn ? tn.parentElement : t;
    var cs = styleSource ? window.getComputedStyle(styleSource) : null;
    postToParent({
      type: 'EDIT_SELECT',
      target: {
        kind: 'text',
        anchor: anchor,
        style: cs ? {
          bold: parseInt(cs.fontWeight || '400', 10) >= 600,
          italic: cs.fontStyle === 'italic',
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          color: rgbToHex(cs.color),
        } : undefined,
      },
    });
  }, true);

  function rgbToHex(color) {
    var m = String(color || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return undefined;
    function h(n) { return Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'); }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
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
      if (p && (p.getAttribute('d') || '') === pathD) return svgs[i];
    }
    return null;
  }

  function applyOp(msg) {
    try {
      if (msg.op === 'replace-text') {
        var tn = findTextNodeByValue(msg.anchor);
        if (!tn) return;
        var leading = (tn.nodeValue || '').match(/^\\s*/)[0];
        var trailing = (tn.nodeValue || '').match(/\\s*$/)[0];
        tn.nodeValue = leading + msg.replacement + trailing;
        if (msg.style && tn.parentElement) {
          if (msg.style.bold) tn.parentElement.style.fontWeight = '700';
          if (msg.style.italic) tn.parentElement.style.fontStyle = 'italic';
          if (msg.style.fontSize) tn.parentElement.style.fontSize = msg.style.fontSize;
          if (msg.style.fontFamily) tn.parentElement.style.fontFamily = msg.style.fontFamily;
          if (msg.style.color) tn.parentElement.style.color = msg.style.color;
        }
      } else if (msg.op === 'replace-image') {
        var img = findImageBySrc(msg.anchor);
        if (img) img.setAttribute('src', msg.replacement);
      } else if (msg.op === 'replace-icon-preview') {
        // For a library swap we don't have the new pathD client-side.
        // Soft-indicate pending state so the user sees *something* changed.
        var svg = findIconBySourcePathD(msg.sourcePathD);
        if (svg) svg.style.opacity = '0.5';
      } else if (msg.op === 'replace-icon-image') {
        // For uploaded icons we swap the <svg> for an <img>.
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
        var tn2 = findTextNodeByValue(msg.anchor);
        if (tn2 && tn2.parentNode) tn2.parentNode.removeChild(tn2);
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
    if (!e.data || e.data.type !== 'EDIT_APPLY') return;
    applyOp(e.data);
  });

  // ── Escape key propagation block (keep parent dialog usable) ──────────────
  document.addEventListener('keydown', function (e) {
    if (!window.__editActive) return;
    if (e.key === 'Escape') {
      // Let the parent dialog decide what to do — forward as a message.
      postToParent({ type: 'EDIT_ESCAPE' });
    }
  }, true);

  // ── Toggle plumbing ───────────────────────────────────────────────────────
  Object.defineProperty(window, '__editActive', {
    get: function () { return window.__editActiveValue; },
    set: function (v) {
      window.__editActiveValue = v;
      if (!v) clearSelectionRing();
    },
    configurable: true,
  });
})();
`;
