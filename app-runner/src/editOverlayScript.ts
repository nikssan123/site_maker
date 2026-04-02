/**
 * Vanilla JS overlay injected into generated apps when edit mode is active.
 * Bundled as a TS string constant so no extra file copy is needed in the build.
 *
 * The caller sets window.__editToken before the IIFE runs.
 */
export const EDIT_OVERLAY_SCRIPT = `
(function () {
  var CARD_ID = '__edit-card';

  function isLeafLike(el) {
    if (el.children.length === 0) return true;
    var inlineNodes = ['SPAN','A','STRONG','EM','B','I','BR','CODE','S','U','SMALL','MARK'];
    return Array.from(el.childNodes).every(function (n) {
      return n.nodeType === 3 || inlineNodes.indexOf(n.nodeName) !== -1;
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
  }

  function showCard(target, isImg) {
    removeCard();
    var original = isImg ? (target.getAttribute('src') || '') : target.innerText.trim();

    var card = document.createElement('div');
    card.id = CARD_ID;
    card.style.cssText = 'position:fixed;z-index:2147483647;top:20px;right:20px;'
      + 'background:#1e1e2e;border:1px solid #45475a;border-radius:10px;padding:16px;width:320px;'
      + 'box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:system-ui,sans-serif;font-size:13px;color:#cdd6f4;';

    var inputStyle = 'width:100%;box-sizing:border-box;padding:7px 9px;background:#181825;'
      + 'border:1px solid #45475a;border-radius:5px;color:#cdd6f4;font-size:13px;outline:none;';

    var inputHtml = isImg
      ? '<input type="url" id="__edit-input" style="' + inputStyle + '" value="' + escHtml(original) + '">'
      : '<textarea id="__edit-input" rows="4" style="' + inputStyle + 'resize:vertical;">' + escHtml(original) + '</textarea>';

    var btnBase = 'padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12px;border:none;';
    card.innerHTML =
      '<div style="font-weight:700;margin-bottom:10px;font-size:14px">' + (isImg ? 'Редактиране на изображение' : 'Редактиране на текст') + '</div>'
      + inputHtml
      + '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">'
      + '<button id="__edit-cancel" style="' + btnBase + 'background:#313244;color:#cdd6f4;">Отказ</button>'
      + '<button id="__edit-save" style="' + btnBase + 'background:#89b4fa;color:#1e1e2e;font-weight:700;">Запази</button>'
      + '</div>';

    document.body.appendChild(card);
    var input = document.getElementById('__edit-input');
    if (input) { input.focus(); }

    document.getElementById('__edit-cancel').addEventListener('click', removeCard);
    document.getElementById('__edit-save').addEventListener('click', function () {
      var inp = document.getElementById('__edit-input');
      var replacement = inp ? inp.value : original;
      window.parent.postMessage(
        { type: 'EDIT_SAVED', patch: { original: original, replacement: replacement, isImg: isImg } },
        '*'
      );
      removeCard();
    });
  }

  // Capture-phase click: intercept before React.
  // Parent frame controls window.__editActive — when false, we do nothing.
  document.addEventListener('click', function (e) {
    if (!window.__editActive) { removeCard(); return; }

    var card = document.getElementById(CARD_ID);
    if (card && card.contains(e.target)) return; // let clicks inside the card through

    e.preventDefault();
    e.stopPropagation();

    var t = e.target;
    if (!t || t === document.body || t === document.documentElement) { removeCard(); return; }

    var isImg = t.tagName === 'IMG';
    var hasText = !isImg && t.textContent && t.textContent.trim().length > 0;
    var isText = hasText && isLeafLike(t);

    if (!isImg && !isText) { removeCard(); return; }

    showCard(t, isImg);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') removeCard();
  });
})();
`;
