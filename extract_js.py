# czn-speed JS bundle assembler.
# Sections 06/07 are read from this folder (toolkit-derived);
# the rest are original sources below. Output: mod_js.js.
import io, os, re

here = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(here, "mod_js.js")

src = io.open(os.path.join(here, "06_spark_guard.js"), encoding="utf-8").read()
lines = src.split("\n")
marks = []
for i, ln in enumerate(lines):
    if ln.startswith("// --- Start of "):
        marks.append((i, ln.split("Start of ")[1].split(" ---")[0]))
marks.append((len(lines), "EOF"))
sec = {}
for k in range(len(marks) - 1):
    sec[marks[k][1]] = "\n".join(lines[marks[k][0] + 1:marks[k + 1][0]]).rstrip() + "\n"

# ================================================================ 00_timers
SEC00 = r"""// --- [MODULE START] 00_timers ---
(function() {
    try {
        if (globalThis._timersHooked) return;
        var origSetTimeout = globalThis.setTimeout;
        var origSetInterval = globalThis.setInterval;
        if (typeof origSetTimeout !== 'function') return;
        function _spd() {
            var v = globalThis._curSpeed;
            return (typeof v === 'number' && v > 0) ? v : ((v === 0) ? 0 : 1);
        }
        function _tmo(t, s) {
            if (!(t > 0)) return t;
            if (s === 0) return 2147483647;          // 0x: V8 timers pause too
            return Math.max(0, Math.round(t / s));
        }
        globalThis.setTimeout = function (handler, timeout) {
            var s = _spd();
            var t = (typeof timeout === 'number') ? _tmo(timeout, s) : timeout;
            var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
            if (a.length > 0) return origSetTimeout.call(this, handler, t, a[0], a[1], a[2], a[3]);
            return origSetTimeout.call(this, handler, t);
        };
        globalThis.setInterval = function (handler, timeout) {
            var s = _spd();
            var t = (typeof timeout === 'number') ? _tmo(timeout, s) : timeout;
            var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
            if (a.length > 0) return origSetInterval.call(this, handler, t, a[0], a[1], a[2], a[3]);
            return origSetInterval.call(this, handler, t);
        };
        globalThis._timersHooked = true;
        globalThis._origSetTimeout = origSetTimeout;
        globalThis._origSetInterval = origSetInterval;
    } catch (e) { }
})();
// --- [MODULE END] 00_timers ---
"""
sec["00_timers.js"] = SEC00

# ================================================================ 03_framework
SEC03 = r"""// --- [MODULE START] 03_framework ---
globalThis.__app = {
    services: {},
    registerService: function (name, service) {
        this.services[name] = service;
        try { if (typeof globalThis._slog === 'function') globalThis._slog('[App] ' + name); } catch (e) { }
    },
    getService: function (name) { return this.services[name] || null; }
};
// --- [MODULE END] 03_framework ---
"""
sec["03_framework.js"] = SEC03

# ================================================================ 04_config
SEC04 = r"""// --- [MODULE START] 04_config ---
(function() {
    var _ring = [], _ringMax = 80;
    globalThis._slog = function (msg) {
        try { _ring.push(String(msg)); if (_ring.length > _ringMax) _ring.shift(); } catch (e) { }
    };
    globalThis._slogDump = function () { return _ring.join('\n'); };

    globalThis._curSpeed = 1;          // applied speed (float, single source of truth)
    globalThis._customVal = 1;         // custom buffer shown in the panel
    globalThis._skipOnBoot = false;
    globalThis._btnPosX = 60;
    globalThis._btnPosY = 100;

    var FU = function () { try { return cc.FileUtils.getInstance(); } catch (e) { return null; } };
    var _path = function () { var f = FU(); return ((f && f.getWritablePath) ? f.getWritablePath() : '') + 'cfg.dat'; };

    globalThis._loadSpeedConfig = function () {
        try {
            var f = FU(); if (!f) return;
            if (!f.isFileExist(_path())) return;
            var content = f.getStringFromFile(_path());
            if (!content || content.length < 3) return;
            var lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim(); if (!line || line.charAt(0) === '#') continue;
                var eq = line.indexOf('='); if (eq < 0) continue;
                var k = line.substring(0, eq).trim().toLowerCase();
                var v = line.substring(eq + 1).trim();
                if (k === 'speed') { var s = parseFloat(v); if (!isNaN(s) && s >= 0 && isFinite(s)) globalThis._curSpeed = Math.round(s * 100) / 100; }
                else if (k === 'skip') { globalThis._skipOnBoot = (v === '1'); }
                else if (k === 'btn_x') { var x = parseInt(v, 10); if (!isNaN(x)) globalThis._btnPosX = x; }
                else if (k === 'btn_y') { var y = parseInt(v, 10); if (!isNaN(y)) globalThis._btnPosY = y; }
            }
            globalThis._customVal = globalThis._curSpeed;
        } catch (e) { }
    };
    globalThis._saveSpeedConfig = function () {
        try {
            var f = FU(); if (!f) return;
            var txt = ['# czn mod',
                       'speed=' + globalThis._curSpeed,
                       'skip=' + (globalThis._animSkipEnabled ? '1' : '0'),
                       'btn_x=' + Math.round(globalThis._btnPosX || 60),
                       'btn_y=' + Math.round(globalThis._btnPosY || 100), ''].join('\n');
            f.writeStringToFile(txt, _path());
        } catch (e) { }
    };
    globalThis._crumb = function (s) {   // one-line diagnostic breadcrumb
        try { var f = FU(); if (f) f.writeStringToFile(s, f.getWritablePath() + '.czn_status'); } catch (e) { }
    };
    __app.registerService('ConfigService', { load: globalThis._loadSpeedConfig, save: globalThis._saveSpeedConfig });
    globalThis._startGlobalKeepAlive = function () { };
})();
// --- [MODULE END] 04_config ---
"""
sec["04_logger_config.js"] = SEC04

# ================================================================ 09_speed_ui
SEC09 = r"""// --- [MODULE START] 09_speed_ui ---
// Touch channel probed at attach: ccui.Widget when available, else a global
// EventListenerTouchOneByOne that swallows only hits on our own rects.
(function () {
    var BTN = 76, PW = 440, KP_W = 300, KP_H = 392;
    var PAD = 12, CH = 44, CG = 9, CW = 76;
    var PH = PAD * 2 + CH * 3 + CG * 2;
    var PRESETS = [0, 0.5, 1, 1.5, 2, 3, 5, 10, 20];

    var ui = null;
    globalThis._cznUI = null;
    var open = false, kpOpen = false, kpBuf = '1';
    var R = [];
    var drag = null;
    var _panelPX = 0, _panelPY = 0;
    var _cznProbed = false;

    function _dir() { return cc.Director.getInstance(); }
    function _win() { return _dir().getWinSize(); }
    function _fmt(v) { return (Math.round(v * 100) / 100).toString(); }
    function _clamp(v) {
        v = parseFloat(v);
        if (isNaN(v) || !isFinite(v)) v = 1;
        v = Math.max(0, Math.min(1000000, v));   // floor 0 = engine pause
        return Math.round(v * 100) / 100;
    }
    function _sz(node, w, h) {
        try { node.setContentSize(cc.size(w, h)); } catch (e) { try { node.setContentSize({ width: w, height: h }); } catch (e2) { } }
    }
    function _mkLayer(parent, color, w, h, x, y, z) {
        var l = cc.LayerColor.create(new cc.Color(color[0], color[1], color[2], color[3]));
        _sz(l, w, h);
        try { l.setPosition(x, y); } catch (e) { }
        parent.addChild(l, z || 0);
        return l;
    }
    function _mkLabel(parent, text, size, cx, cy, z) {
        var t = null;
        try {
            if (cc.Label && cc.Label.createWithTTF) t = cc.Label.createWithTTF(text, 'font/font_main.ttf', size);
            else if (cc.Label && cc.Label.createWithSystemFont) t = cc.Label.createWithSystemFont(text, 'Arial', size);
        } catch (e) { }
        if (!t) return null;
        try { t.setColor(cc.color(255, 255, 255)); } catch (e) { }
        parent.addChild(t, (z || 0) + 1);
        try { t.setPosition(cx, cy); } catch (e) { }
        return t;
    }
    function _reg(id, x, y, w, h) { R.push({ id: id, x: x, y: y, w: w, h: h }); }
    function _hit(x, y) {
        for (var i = 0; i < R.length; i++) {
            var r = R[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
        }
        return null;
    }
    function _btnText() { return _fmt(globalThis._curSpeed) + 'x' + (globalThis._animSkipEnabled ? ' sk' : ''); }
    function _cellRect(i) {
        return { x: PAD + (i % 5) * (CW + CG), y: PH - PAD - CH - Math.floor(i / 5) * (CH + CG), w: CW, h: CH };
    }
    function _row3Rect(j) {
        var hw = (PW - PAD * 2 - 8) / 2;
        return { x: PAD + j * (hw + 8), y: PAD, w: hw, h: CH };
    }
    function _rebuildRegions() {
        R = [];
        _reg('btn', globalThis._btnPosX, globalThis._btnPosY, BTN, BTN);
        if (!open && !kpOpen) return;
        var ox = globalThis._btnPosX + _panelPX, oy = globalThis._btnPosY + _panelPY;
        var i, x0, y0;
        if (kpOpen) {
            var kw = 84, kh = 54, g = 8, gy = KP_H - 64;
            var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'bk'];
            for (i = 0; i < keys.length; i++) {
                var col = i % 3, ri = Math.floor(i / 3);
                _reg(keys[i] === 'bk' ? 'kbk' : 'k' + keys[i],
                     ox + 14 + col * (kw + g), oy + gy - ri * (kh + g) - kh, kw, kh);
            }
            _reg('kapply', ox + 14, oy + 14, 130, 44);
            _reg('kcancel', ox + 156, oy + 14, 130, 44);
            _reg('kpanel', ox, oy, KP_W, KP_H);
            return;
        }
        for (i = 0; i < 9; i++) {
            x0 = PAD + (i % 5) * (CW + CG);
            y0 = PH - PAD - CH - Math.floor(i / 5) * (CH + CG);
            _reg('g' + i, ox + x0, oy + y0, CW, CH);
        }
        x0 = PAD + 4 * (CW + CG);
        _reg('custom', ox + x0, oy + PH - PAD - CH - (CH + CG), CW, CH);
        var hw = (PW - PAD * 2 - 8) / 2;
        _reg('skip', ox + PAD, oy + PAD, hw, CH);
        _reg('reset', ox + PAD + hw + 8, oy + PAD, hw, CH);
        _reg('panel', ox, oy, PW, PH);
    }

    function _apply(v) {
        v = _clamp(v);
        globalThis._curSpeed = v; globalThis._customVal = v;
        try {
            var dir = _dir();
            dir.getScheduler().setTimeScale(v);
            if (typeof dir.getSchedulerByIndex === 'function') {
                var s2 = dir.getSchedulerByIndex(0);
                if (s2 && typeof s2.setTimeScale === 'function') s2.setTimeScale(v);
            }
            if (typeof yuna !== 'undefined' && yuna.setenv) yuna.setenv('time_scale', v);
        } catch (e) { }
        if (v > 1) { try { if (typeof globalThis._ensureGuardsInstalled === 'function') globalThis._ensureGuardsInstalled(); } catch (e) { } }
        try { if (ui && ui.lbl) ui.lbl.setString(_btnText()); } catch (e) { }
        try { globalThis._saveSpeedConfig(); } catch (e) { }
        globalThis._slog('speed=' + v);
    }

    function _side(w, h) {   // place overlay on the side with more free room
        var W = _win();
        var bx = globalThis._btnPosX, by = globalThis._btnPosY, gap = 12;
        var px = ((W.width - (bx + BTN)) >= bx) ? gap : -(w + gap);
        var py = ((W.height - (by + BTN)) >= by) ? gap : -(h + gap);
        px = Math.max(4 - bx, Math.min(px, W.width - 4 - w - bx));
        py = Math.max(4 - by, Math.min(py, W.height - 4 - h - by));
        if (px < BTN && px + w > 0 && py < BTN && py + h > 0) {   // never cover the button
            if ((W.height - (by + BTN)) >= by) py = BTN + gap; else py = -(h + gap);
            py = Math.max(4 - by, Math.min(py, W.height - 4 - h - by));
        }
        return { px: Math.round(px), py: Math.round(py) };
    }

    function _buildPanel() {
        _clearOverlays();
        var scene = ui && ui.scene;
        if (!scene || !ui.btn) return;
        var s = _side(PW, PH);
        _panelPX = s.px; _panelPY = s.py;
        var ox = globalThis._btnPosX + s.px, oy = globalThis._btnPosY + s.py;
        var panel;
        if (ui.path === 'ccui') {
            panel = ccui.Widget.create();
            try { panel.setAnchorPoint(0, 0); } catch (e) { }
            panel.setTouchEnabled(true);
            _sz(panel, PW, PH);
            _mkLayer(panel, [14, 14, 18, 238], PW, PH, 0, 0, 0);
            panel.addTouchEventListener(function (sender, state, x, y) {
                try { _onTouch(state, _tcoord(sender, state, x, y)); } catch (e) { _terr('ccui-panel', e); }
            });
            try { panel.setPosition(s.px, s.py); } catch (e) { }
            ui.btn.addChild(panel, 10);
        } else {
            panel = _mkLayer(scene, [14, 14, 18, 238], PW, PH, ox, oy, 99992);
        }
        ui.panel = panel; ui.refs = {};
        ui.refs.chips = [];
        var i, cr, act;
        for (i = 0; i < 9; i++) {
            cr = _cellRect(i);
            act = Math.abs(globalThis._curSpeed - PRESETS[i]) < 0.001;
            ui.refs.chips[i] = _mkLayer(panel, act ? [255, 255, 255, 46] : [255, 255, 255, 20], cr.w, cr.h, cr.x, cr.y);
            _mkLabel(panel, _fmt(PRESETS[i]), 20, cr.x + cr.w / 2, cr.y + cr.h / 2);
        }
        cr = _cellRect(9);
        _mkLayer(panel, [255, 255, 255, 30], cr.w, cr.h, cr.x, cr.y);
        _mkLabel(panel, '\u81ea\u5b9a\u4e49', 18, cr.x + cr.w / 2, cr.y + cr.h / 2);
        var r3a = _row3Rect(0), r3b = _row3Rect(1);
        _mkLayer(panel, [255, 255, 255, 20], r3a.w, r3a.h, r3a.x, r3a.y);
        ui.refs.skip = _mkLabel(panel, '\u8df3\u8fc7\u52a8\u753b\uff1a' + (globalThis._animSkipEnabled ? '\u5f00' : '\u5173'), 19, r3a.x + r3a.w / 2, r3a.y + r3a.h / 2);
        _mkLayer(panel, [255, 255, 255, 26], r3b.w, r3b.h, r3b.x, r3b.y);
        _mkLabel(panel, '\u590d\u4f4d 1x', 19, r3b.x + r3b.w / 2, r3b.y + r3b.h / 2);
        open = true; kpOpen = false;
        _rebuildRegions();
    }

    function _buildKeypad() {
        _clearOverlays();
        var scene = ui && ui.scene;
        if (!scene || !ui.btn) return;
        var s = _side(KP_W, KP_H);
        _panelPX = s.px; _panelPY = s.py;
        var ox = globalThis._btnPosX + s.px, oy = globalThis._btnPosY + s.py;
        var kp;
        if (ui.path === 'ccui') {
            kp = ccui.Widget.create();
            try { kp.setAnchorPoint(0, 0); } catch (e) { }
            kp.setTouchEnabled(true);
            _sz(kp, KP_W, KP_H);
            _mkLayer(kp, [14, 14, 18, 244], KP_W, KP_H, 0, 0, 0);
            kp.addTouchEventListener(function (sender, state, x, y) {
                try { _onTouch(state, _tcoord(sender, state, x, y)); } catch (e) { _terr('ccui-kp', e); }
            });
            try { kp.setPosition(s.px, s.py); } catch (e) { }
            ui.btn.addChild(kp, 10);
        } else {
            kp = _mkLayer(scene, [14, 14, 18, 244], KP_W, KP_H, ox, oy, 99992);
        }
        ui.keypad = kp; kpOpen = true;
        _mkLabel(kp, kpBuf === '' ? '0' : kpBuf, 30, KP_W / 2, KP_H - 30, 1);
        var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'bk'];
        var kw = 84, kh = 54, g = 8, gy = KP_H - 64;
        for (var i = 0; i < keys.length; i++) {
            var col = i % 3, ri = Math.floor(i / 3);
            var x0 = 14 + col * (kw + g), y0 = gy - ri * (kh + g) - kh;
            _mkLayer(kp, [255, 255, 255, 20], kw, kh, x0, y0);
            _mkLabel(kp, keys[i] === 'bk' ? '\u5220\u9664' : keys[i], 22, x0 + kw / 2, y0 + kh / 2);
        }
        _mkLayer(kp, [255, 255, 255, 34], 130, 44, 14, 14);
        _mkLabel(kp, '\u5e94\u7528', 22, 79, 36);
        _mkLayer(kp, [255, 255, 255, 16], 130, 44, 156, 14);
        _mkLabel(kp, '\u53d6\u6d88', 22, 221, 36);
        _rebuildRegions();
    }
    function _clearOverlays() {
        if (ui && ui.panel) { try { ui.panel.removeFromParent(); } catch (e) { } ui.panel = null; }
        if (ui && ui.keypad) { try { ui.keypad.removeFromParent(); } catch (e) { } ui.keypad = null; }
        open = false; kpOpen = false;
        _rebuildRegions();
    }
    function _refreshPanel() {
        if (!open || !ui) return;
        try { _highlightPanel(); } catch (e) { _buildPanel(); }
    }
    function _highlightPanel() {   // opacity/text updates, zero node churn
        var i;
        for (i = 0; i < 9; i++) {
            var bg = ui.refs.chips ? ui.refs.chips[i] : null;
            if (!bg) continue;
            var act = Math.abs(globalThis._curSpeed - PRESETS[i]) < 0.001;
            try { bg.setOpacity(act ? 46 : 20); } catch (e) { throw e; }
        }
        try { if (ui.refs.skip) ui.refs.skip.setString('\u8df3\u8fc7\u52a8\u753b\uff1a' + (globalThis._animSkipEnabled ? '\u5f00' : '\u5173')); } catch (e) { throw e; }
        try { if (ui.lbl) ui.lbl.setString(_btnText()); } catch (e) { }
    }

    // ---- input state machine (single implementation for every channel) ----
    function _terr(tag, e) {
        try {
            var m = tag + ': ' + ((e && (e.message || e.stack)) ? (e.message || String(e)) : String(e));
            if (globalThis.__cznLastErr !== m) {
                globalThis.__cznLastErr = m;
                globalThis._crumb('touch-err ' + m);
            }
        } catch (e2) { }
    }
    function _onTouchBegan(p) {
        globalThis.__cznTapN = (globalThis.__cznTapN || 0) + 1;
        var id = _hit(p.x, p.y);
        if (id === null) {
            if (open || kpOpen) { _clearOverlays(); }
            return false;
        }
        drag = { start: p, moved: false, btn: (id === 'btn') };
        return true;
    }
    function _onTouchMoved(p) {
        if (drag && drag.btn && !open && !kpOpen && ui && ui.btn) {
            if (Math.abs(p.x - drag.start.x) + Math.abs(p.y - drag.start.y) > 12) { drag.moved = true; globalThis.__cznMovedN = (globalThis.__cznMovedN || 0) + 1; }
            if (drag.moved) {
                var W = _win();
                globalThis._btnPosX = Math.round(Math.max(4, Math.min(W.width - BTN - 4, p.x - BTN / 2)));
                globalThis._btnPosY = Math.round(Math.max(4, Math.min(W.height - BTN - 4, p.y - BTN / 2)));
                try { ui.btn.setPosition(globalThis._btnPosX, globalThis._btnPosY); } catch (e) { }
                _rebuildRegions();
            }
        }
    }
    function _onTouchEnded(p) {
        var wasDrag = drag && drag.moved; drag = null;
        if (wasDrag) { try { globalThis._saveSpeedConfig(); } catch (e) { } _rebuildRegions(); return; }
        var id = _hit(p.x, p.y);
        if (kpOpen) {
            if (id === 'kcancel') { _clearOverlays(); _refreshPanel(); return; }
            if (id === 'kapply') {
                var v = _clamp(kpBuf === '' ? globalThis._customVal : parseFloat(kpBuf));
                _apply(v); _clearOverlays(); _refreshPanel(); return;
            }
            if (id === 'kbk') { kpBuf = kpBuf.slice(0, -1); _buildKeypad(); return; }
            if (id && id.charAt(0) === 'k' && id.length === 2) {
                var ch = id.charAt(1);
                if (ch === '.' && kpBuf.indexOf('.') >= 0) return;
                if (kpBuf === '0') kpBuf = ch; else if (kpBuf.length < 6) kpBuf += ch;
                _buildKeypad(); return;
            }
            return;
        }
        if (open) {
            if (id && id.charAt(0) === 'g' && id.length === 2) {
                var idx = parseInt(id.charAt(1), 10);
                if (!isNaN(idx) && PRESETS[idx] !== undefined) _apply(PRESETS[idx]);
                _refreshPanel(); return;
            }
            if (id === 'custom') { kpBuf = _fmt(globalThis._customVal); _buildKeypad(); return; }
            if (id === 'skip') {
                try { if (typeof globalThis._toggleCardSkip === 'function') globalThis._toggleCardSkip(); } catch (e) { }
                try { if (ui && ui.lbl) ui.lbl.setString(_btnText()); } catch (e) { }
                try { globalThis._saveSpeedConfig(); } catch (e) { }
                _refreshPanel(); return;
            }
            if (id === 'reset') { _apply(1); _refreshPanel(); return; }
            if (id === 'btn') { _clearOverlays(); return; }
            return;
        }
        _buildPanel();
    }
    function _onTouch(state, pos) {
        try {
            if (state === 0) { globalThis.__cznBeganN = (globalThis.__cznBeganN || 0) + 1; return _onTouchBegan(pos); }
            if (state === 1) { return _onTouchMoved(pos); }
            globalThis.__cznEndedN = (globalThis.__cznEndedN || 0) + 1;
            return _onTouchEnded(pos);
        } catch (e) { _terr('onTouch', e); }
    }

    // ---- global touch listener (eventManager fallback channel) ------------
    function _installListener() {
        if (globalThis._cznListener) return;
        var disp = _dir().getEventDispatcher();
        if (!disp || !cc.EventListenerTouchOneByOne || !cc.EventListenerTouchOneByOne.create) return;
        var listener = cc.EventListenerTouchOneByOne.create();
        try { if (typeof listener.setSwallowTouches === 'function') listener.setSwallowTouches(true); } catch (e) { }
        listener.onTouchBegan = function (touch, event) {
            try { return _onTouchBegan(touch.getLocation()); } catch (e) { _terr('em-began', e); return false; }
        };
        listener.onTouchMoved = function (touch, event) {
            try { _onTouchMoved(touch.getLocation()); } catch (e) { _terr('em-moved', e); }
        };
        listener.onTouchEnded = function (touch, event) {
            try { _onTouchEnded(touch.getLocation()); } catch (e) { _terr('em-ended', e); }
        };
        listener.onTouchCancelled = function (touch, event) { drag = null; };
        disp.addEventListenerWithFixedPriority(listener, -128);
        globalThis._cznListener = listener;
    }

    // ---- attach: visible nodes on the running scene ------------------------
    function _ccuiAvailable() {
        try {
            if (typeof ccui === 'undefined' || !ccui.Widget || !ccui.Widget.create) return false;
            var w = ccui.Widget.create();
            var okw = (w && typeof w.addTouchEventListener === 'function' &&
                       typeof w.setTouchEnabled === 'function');
            try { if (w) w.removeFromParent(); } catch (e) { }
            return okw ? true : false;
        } catch (e) { return false; }
    }
    function _tcoord(sender, state, x, y) {
        var pos;
        if (typeof x === 'number' && typeof y === 'number') pos = { x: x, y: y };
        else {
            if (state === 0 && typeof sender.getTouchBeganPosition === 'function') pos = sender.getTouchBeganPosition();
            else if (state === 1 && typeof sender.getTouchMovePosition === 'function') pos = sender.getTouchMovePosition();
            else if (typeof sender.getTouchEndPosition === 'function') pos = sender.getTouchEndPosition();
            else pos = { x: 0, y: 0 };
        }
        if (Array.isArray(pos)) pos = { x: pos[0], y: pos[1] };
        if (!pos || typeof pos.x !== 'number') pos = { x: 0, y: 0 };
        return pos;
    }
    function _probe() {
        try {
            var r = {
                ccui: _ccuiAvailable() ? 1 : 0,
                eventManager: (_dir() && typeof _dir().getEventDispatcher === 'function') ? 1 : 0,
                oneByOne: (cc.EventListenerTouchOneByOne && cc.EventListenerTouchOneByOne.create) ? 1 : 0,
                setTimeout: (typeof globalThis.setTimeout === 'function') ? 1 : 0,
                scheduler: (function () { try { var sc = _dir().getScheduler(); return (sc && typeof sc.schedule === 'function') ? 1 : 0; } catch (e) { return 0; } })()
            };
            return r;
        } catch (e) { return { probe_err: String(e) }; }
    }
    function _attach(scene) {
        if (!scene) return { ok: false, why: 'no-scene' };
        if (ui && ui.btn && ui.btn.getParent() === scene) return { ok: true };
        try {
            _clearOverlays();
            var path = 'none', c = null, lbl = null;
            if (_ccuiAvailable()) {
                c = ccui.Widget.create();
                try { c.setAnchorPoint(0, 0); } catch (e) { }
                c.setTouchEnabled(true);
                _sz(c, BTN, BTN);
                var bg = _mkLayer(c, [18, 18, 22, 200], BTN, BTN, 0, 0, 0);
                lbl = _mkLabel(bg, _btnText(), 25, BTN / 2, BTN / 2, 1);
                c.addTouchEventListener(function (sender, state, x, y) {
                    try { _onTouch(state, _tcoord(sender, state, x, y)); } catch (e) { _terr('ccui-btn', e); }
                });
                try { c.setPosition(globalThis._btnPosX, globalThis._btnPosY); } catch (e) { }
                scene.addChild(c, 99990);
                path = 'ccui';
            } else {
                c = _mkLayer(scene, [18, 18, 22, 200], BTN, BTN, globalThis._btnPosX, globalThis._btnPosY, 99990);
                lbl = _mkLabel(c, _btnText(), 25, BTN / 2, BTN / 2, 1);
                _installListener();
                path = globalThis._cznListener ? 'event-manager' : 'none';
            }
            ui = { btn: c, lbl: lbl, scene: scene, panel: null, keypad: null, refs: {}, path: path };
            globalThis._cznUI = ui;
            if (!_cznProbed) {
                _cznProbed = true;
                try {
                    var pr = _probe();
                    var prs = (typeof JSON !== 'undefined' && JSON.stringify) ? JSON.stringify(pr) : String(pr);
                    globalThis._crumb('probe: ' + prs + ' path: ' + path);
                } catch (e) { }
            }
            if (path === 'none') return { ok: false, why: 'no-touch-channel' };
            return { ok: true };
        } catch (e) { return { ok: false, why: 'build:' + e }; }
    }
    globalThis._cznAttachUI = function (scene) { return _attach(scene); };
    globalThis._applySpeed = _apply;
    globalThis._slog('ui ready');
})();
// --- [MODULE END] 09_speed_ui ---
"""
sec["09_speed_ui.js"] = SEC09

# ---------------------------------------------------------------- assemble
BOOT = r"""
// --- [mod] native-driven tick: boot -> self-healing UI + keep-alive ---
(function () {
    globalThis.__cznTickN = 0;
    globalThis.__cznLastNote = '';
    globalThis.__cznBootTick = function () {
        var note = '';
        try {
            globalThis.__cznTickN++;
            if (!globalThis.__cznCfgLoaded) {
                globalThis.__cznCfgLoaded = true;
                try { if (typeof globalThis._loadSpeedConfig === 'function') globalThis._loadSpeedConfig(); } catch (e) { }
                try { if (globalThis._curSpeed !== 1 && typeof globalThis._applySpeed === 'function') globalThis._applySpeed(globalThis._curSpeed); } catch (e) { }
                try { if (globalThis._skipOnBoot && !globalThis._animSkipEnabled && typeof globalThis._toggleCardSkip === 'function') globalThis._toggleCardSkip(); } catch (e) { }
            }
            var scene = null;
            try { scene = cc.Director.getInstance().getRunningScene(); } catch (e) { }
            if (!scene) {
                note = 'scene=null';
            } else {
                try {
                    var alive = globalThis._cznUI && globalThis._cznUI.btn && globalThis._cznUI.btn.getParent() === scene;
                    if (!alive && typeof globalThis._cznAttachUI === 'function') {
                        var ar = globalThis._cznAttachUI(scene);
                        if (ar && !ar.ok) note = 'attach-fail: ' + ar.why;
                    }
                } catch (e) { note = 'attach-throw: ' + e; }
                if (!globalThis.__cznReady && globalThis._cznUI && globalThis._cznUI.btn && globalThis._cznUI.btn.getParent() === scene) {
                    globalThis.__cznReady = true;
                    note = 'boot ok path=' + (globalThis._cznUI.path || '?');
                }
                if (globalThis.__cznTickN % 6 === 0) {
                    try { if (globalThis._curSpeed !== 1 && typeof globalThis._applySpeed === 'function') globalThis._applySpeed(globalThis._curSpeed); } catch (e) { }
                    try { if (globalThis._animSkipEnabled && globalThis.AnimSkipService && typeof globalThis.AnimSkipService.refreshHooks === 'function') globalThis.AnimSkipService.refreshHooks(); } catch (e) { }
                }
            }
        } catch (e) { note = 'err: ' + e; }
        try {
            if (note && note !== globalThis.__cznLastNote) {
                globalThis.__cznLastNote = note;
                globalThis._crumb(note);
            }
        } catch (e) { }
    };
    globalThis._cznUI = null;

    // ---- periodic driver installer (retries until a channel works) --------
    var rep = [], ok = false;
    try {
        var dir = cc.Director.getInstance();
        var tick = function () {
            try { if (typeof globalThis.__cznBootTick === 'function') globalThis.__cznBootTick(); } catch (e) { }
        };
        // channel A: JSB scheduler timers (multi-signature; error text logged)
        if (globalThis.__cznTimerOk) { rep.push('timer=ok'); ok = true; }
        else {
            try {
                var sched = dir.getScheduler ? dir.getScheduler() : null;
                if (sched && typeof sched.schedule === 'function') {
                    var REP = (cc.REPEAT_FOREVER !== undefined) ? cc.REPEAT_FOREVER : 0xFFFFFFFF;
                    var variants = [
                        function (cb, t) { sched.schedule(cb, t, 0.5, REP, 0, false); },
                        function (cb, t) { sched.schedule(cb, t, 0.5); },
                        function (cb, t) { sched.schedule(cb, 0.5); }
                    ];
                    for (var i = 0; i < variants.length && !ok; i++) {
                        try { var tgt = { _modTick: true }; variants[i](tick, tgt);
                              globalThis.__cznTimerOk = true; ok = true; rep.push('sched' + i + '=ok'); }
                        catch (e) { rep.push('sched' + i + '=' + e); }
                    }
                } else rep.push('no-schedule-fn');
            } catch (e) { rep.push('sched=' + e); }
        }
        // channel B: scene-anchored action (needs a running scene)
        if (globalThis.__cznActionOk) { rep.push('action=ok'); ok = true; }
        else {
            try {
                var scene = dir.getRunningScene ? dir.getRunningScene() : null;
                if (scene) {
                    var node = (cc.Node && cc.Node.create) ? cc.Node.create() : new cc.Node();
                    scene.addChild(node);
                    var d = cc.DelayTime.create(0.5);
                    var c2 = cc.CallFunc.create(tick);
                    var sq = cc.Sequence.create(d, c2);
                    node.runAction((cc.RepeatForever && cc.RepeatForever.create) ? cc.RepeatForever.create(sq) : sq);
                    globalThis.__cznActionOk = true; ok = true; rep.push('action=ok');
                } else rep.push('action=scene-null');
            } catch (e) { rep.push('action=' + e); }
        }
        globalThis._crumb('install: ' + rep.join(' '));
    } catch (e) {
        try { globalThis._crumb('install fatal: ' + e); } catch (e2) { }
    }
    return ok ? "1" : "0";
})();
"""

order = ["00_timers.js", "03_framework.js", "04_logger_config.js",
         "06_spark_guard.js", "07_anim_skip.js", "09_speed_ui.js"]
parts = ["// CZN runtime module JS",
         "// sections: " + ", ".join(order), ""]
for name in order:
    parts.append("// ======== " + name + " ========")
    if name in ("06_spark_guard.js", "07_anim_skip.js"):
        parts.append(io.open(os.path.join(here, name), encoding="utf-8").read())
    else:
        parts.append(sec[name])
parts.append(BOOT)

out = "\n".join(parts)

# ---------------------------------------------------------------- shim
n_repl = out.count("(typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1")
out = out.replace("(typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1",
                  "(globalThis._curSpeed || 1)")

# ---------------------------------------------------------------- visibility
PRELUDE = (
    "(function () {\n"
    "    function _dump() {\n"
    "        try {\n"
    "            var fu = cc.FileUtils.getInstance();\n"
    "            var body = '';\n"
    "            if (globalThis.__modErr) body += 'MOD_ERR:' + globalThis.__modErr + '\\n';\n"
    "            body += 'RING:' + (globalThis._slogDump ? globalThis._slogDump() : '');\n"
    "            fu.writeStringToFile(body, fu.getWritablePath() + '.czn_status');\n"
    "        } catch (e2) { }\n"
    "    }\n"
    "    globalThis.__modDump = _dump;\n"
    "    if (typeof setTimeout === 'function') { setTimeout(_dump, 2000); setTimeout(_dump, 8000); }\n"
    "})();\n"
)
CATCH = (
    "} catch (e) {\n"
    "    globalThis.__modErr = (e && (e.stack || e.message)) || String(e);\n"
    "    if (typeof globalThis.__modDump === 'function') globalThis.__modDump();\n"
    "    throw e;\n"
    "}\n"
)
out = PRELUDE + "try {\n" + out + "\n" + CATCH

# ---------------------------------------------------------------- neutralize
out = out.replace("_speedLog", "_slog")
out = out.replace("SpeedHack", "Mod")
out = out.replace("[SPARK V20]", "[g7]")
out = out.replace("SPARK GUARD", "gd")
out = out.replace("[SKIP]", "[sk]")

assert ")JS" not in out, "raw-string terminator collision"

# ---------------------------------------------------------------- asserts
left = re.findall(r"_SPEED_LEVELS|_speedIdx|_speedCustom", out)
assert not left, "old speed-model refs remain: %d" % len(left)
for need in ["_cznAttachUI", "__cznBootTick", "registerService", "_toggleCardSkip",
             "addEventListenerWithFixedPriority", "getLocation",
             "function _onTouch(state, pos)", "function _onTouchBegan(p)",
             "function _onTouchEnded(p)", "_highlightPanel", "_cellRect", "_row3Rect",
             "__cznTapN", "__cznMovedN", "_crumb"]:
    assert need in out, "missing: " + need
assert "__app.on" not in out and "registerPage" not in out, "dead framework members remain"
assert "czn_speed v" not in out and "czn-speed v" not in out, "version string leaked"
assert ".czn_install" not in out and ".czn_js_status" not in out and "mod_log" not in out, "stale file refs"

io.open(OUT, "w", encoding="utf-8", newline="\n").write(out)
print("written", OUT, len(out), "bytes,", out.count("\n"), "lines; shim replacements:", n_repl)
