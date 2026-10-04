// --- [MODULE START] 07_anim_skip.js ---
(function() {
// ============================================================
// F11 触发 — 战斗动画跳过 v2
// 策略：Hook cc.DelayTime.create + 扫描实体 action_state
// 只在战斗中生效，不影响 UI / 大厅
// ============================================================
globalThis._animSkipEnabled = false;
var _animSkipTimer = null;
var _skipStats = { delayHooked: 0, delaySkipped: 0, entityForced: 0, spineAccel: 0 };
var _timerHookLog = 0; // 定时器 hook 日志计数

// (comprehensiveProbe, probeBattleGlobals, inBattle — deleted: pure probing code)
// ---- Hook 1: cc.DelayTime.create ----
var _origDelayTimeCreate = null;

function _hookDelayTime() {
    if (_origDelayTimeCreate) return; // 已经 hook 过
    try {
        if (cc && cc.DelayTime && cc.DelayTime.create) {
            _origDelayTimeCreate = cc.DelayTime.create;
            cc.DelayTime.create = function (duration) {
                _skipStats.delayHooked++;
                if (globalThis._animSkipEnabled && !_sparkGuardActive && duration > 0.02) {
                    _skipStats.delaySkipped++;
                    return _origDelayTimeCreate.call(this, 0.001);
                }
                return _origDelayTimeCreate.call(this, duration);
            };
            globalThis._speedLog('[SKIP] Hooked cc.DelayTime.create');
        } else {
            globalThis._speedLog('[SKIP] cc.DelayTime.create not found');
        }
    } catch (e) {
        globalThis._speedLog('[SKIP] DelayTime hook err: ' + e);
    }
}

// ---- Hook 2: cc.FadeIn / cc.FadeOut / cc.ScaleTo 等动画 ----
var _origFadeInCreate = null;
var _origFadeOutCreate = null;

function _hookFadeAnimations() {
    try {
        if (cc.FadeIn && cc.FadeIn.create && !_origFadeInCreate) {
            _origFadeInCreate = cc.FadeIn.create;
            cc.FadeIn.create = function (duration) {
                if (globalThis._animSkipEnabled && duration > 0.02) {
                    return _origFadeInCreate.call(this, 0.001);
                }
                return _origFadeInCreate.call(this, duration);
            };
        }
        if (cc.FadeOut && cc.FadeOut.create && !_origFadeOutCreate) {
            _origFadeOutCreate = cc.FadeOut.create;
            cc.FadeOut.create = function (duration) {
                if (globalThis._animSkipEnabled && duration > 0.02) {
                    return _origFadeOutCreate.call(this, 0.001);
                }
                return _origFadeOutCreate.call(this, duration);
            };
        }
        globalThis._speedLog('[SKIP] Hooked FadeIn/FadeOut.create');
    } catch (e) {
        globalThis._speedLog('[SKIP] Fade hook err: ' + e);
    }
}

// ---- Hook 3: 实体 Spine 加速 ----
var _entityProbed = false;

var _cachedInterceptEntity = null; // getEntityOfUID 拦截到的实体临时缓存

function _collectEntities() {
    var list = [];
    try {
        var em = globalThis['EntityManager'];
        if (!em) return list;

        // 诊断：列出 EntityManager 的所有属性（包括原型链）
        var allProps = [];
        var propCount = 0;
        for (var k in em) {
            propCount++;
            if (propCount <= 30) {
                allProps.push(k + '=' + typeof em[k]);
            }
        }
        if (!_entityProbed) {
            globalThis._speedLog('[EM] All props(' + propCount + '): ' + allProps.join(', '));
        }

        // 方案1: 直接属性名
        var searchKeys = ['team', 'monsters', 'supporter_team', '_team', '_monsters',
            'entities', '_entities', 'entityList', 'list', 'characters',
            'actors', '_actors', 'members', 'units'];
        for (var s = 0; s < searchKeys.length; s++) {
            var val = em[searchKeys[s]];
            if (val) {
                if (Array.isArray(val)) {
                    for (var i = 0; i < val.length; i++) if (val[i]) list.push(val[i]);
                } else if (typeof val === 'object') {
                    var vk = Object.keys(val);
                    for (var i = 0; i < vk.length; i++) if (val[vk[i]] && typeof val[vk[i]] === 'object') list.push(val[vk[i]]);
                }
                if (list.length > 0 && !_entityProbed) {
                    globalThis._speedLog('[EM] Found ' + list.length + ' entities via em.' + searchKeys[s]);
                    break;
                }
            }
        }

        // 方案2: 遍历所有属性，找包含 playAnimation 或 showSparkEffect 方法的对象
        if (list.length === 0) {
            for (var k in em) {
                try {
                    var v = em[k];
                    if (v && typeof v === 'object' && !Array.isArray(v)) {
                        // 是不是实体对象？
                        if (typeof v.playAnimation === 'function' || typeof v.showSparkEffect === 'function') {
                            list.push(v);
                            if (!_entityProbed) globalThis._speedLog('[EM] Found entity at em.' + k);
                        }
                        // 是不是容器（Map/数组）包含实体？
                        if (list.length === 0) {
                            for (var kk in v) {
                                try {
                                    var vv = v[kk];
                                    if (vv && typeof vv === 'object' &&
                                        (typeof vv.playAnimation === 'function' || typeof vv.showSparkEffect === 'function')) {
                                        list.push(vv);
                                        if (!_entityProbed) globalThis._speedLog('[EM] Found entity at em.' + k + '.' + kk);
                                    }
                                } catch (e2) { }
                                if (list.length >= 3) break;
                            }
                        }
                    }
                } catch (e) { }
                if (list.length >= 3) break;
            }
        }

        // 方案3: Hook getEntityOfUID 来拦截实体引用
        // v15: 增加 Error().stack 检测 selectCardRSpark 调用链
        if (list.length === 0 && typeof em.getEntityOfUID === 'function' && !em._origGetEntityOfUID) {
            em._origGetEntityOfUID = em.getEntityOfUID;
            em.getEntityOfUID = function (uid) {
                var entity = em._origGetEntityOfUID.call(this, uid);
                if (entity && !_protoHooked) {
                    globalThis._speedLog('[EM-INTERCEPT] Got entity from getEntityOfUID(uid=' + uid + '), hooking prototype...');
                    _cachedInterceptEntity = entity;
                    try { _hookEntityPlayAnimation(true); } catch (e) { }
                    _cachedInterceptEntity = null;
                }
                // v15: Stack trace R-Spark detection
                // getEntityOfUID 是唯一不被 V8 IC 绕过的 hook 点
                // selectCardRSpark 在选牌时调用 EntityManager.getEntityOfUID(char_id)
                // 检查调用栈来判断当前是否处于 R-Spark 流程
                if (globalThis._animSkipEnabled) {
                    _getEntityCallCount++;
                    try {
                        var stack = new Error().stack;
                        // 诊断: 前10次调用记录 stack 前150字符
                        if (_getEntityCallCount <= 10) {
                            globalThis._speedLog('[EM-CALL#' + _getEntityCallCount + '] uid=' + uid + ' stack=' + (stack ? stack.substring(0, 150).replace(/\n/g, ' | ') : 'N/A'));
                        }
                        if (!_sparkGuardActive && stack && (stack.indexOf('selectCardRSpark') >= 0 || stack.indexOf('selectCardSpark') >= 0)) {
                            _sparkGuardActive = true;
                            globalThis._speedLog('[SPARK] >>> R-SPARK GUARD ON via M5:stack-trace (uid=' + uid + ')');
                            globalThis._speedLog('[SPARK] stack: ' + stack.substring(0, 300));
                            if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
                            _sparkGuardTimer = setTimeout(function () {
                                _sparkGuardActive = false;
                                globalThis._speedLog('[SPARK] <<< auto-resume after 15s timeout');
                            }, 15000);
                        }
                    } catch (e) { }
                }
                return entity;
            };
            globalThis._speedLog('[EM] Hooked getEntityOfUID as entity interceptor (v15: +stack-trace R-Spark detection)');
        }

    } catch (e) {
        globalThis._speedLog('[EM] collectEntities error: ' + e);
    }
    return list;
}



// ---- 方案 v12: PROTOTYPE-LEVEL hook ----
// v10/v11 失败原因: V8 Inline Cache (IC) 缓存了属性查找结果
//   编译后的字节码 GetNamedProperty 第一次执行时缓存了函数引用
//   之后的调用直接用缓存，不再经过 JS 属性查找
//   因此实例级别的属性覆盖被 IC 完全绕过
// v12: hook PROTOTYPE 上的方法 — IC 缓存的是 prototype slot 的引用
//   修改 prototype 上的函数 → 所有调用都被拦截
var _protoHooked = false;
var _origProtoPlayAnimation = null;
var _origProtoSetAnimation = null;
var _origProtoGetAnimLen = null;
var _origProtoShowSparkEffect = null;
var _origProtoCheckSparkEffect = null;
var _playAnimLogCount = 0;
var _MAX_PLAY_LOGS = 200;
// 灵光一闪 exemption — 由 showSparkEffect prototype hook 驱动
// _sparkGuardActive 已在 L333 声明，此处不再重复
var _sparkGuardTimer = null;
var _battleEventHooked = false;
var _sparkCallCount = 0;  // showSparkEffect 调用次数
var _MAX_SPARK_LOGS = 100;
var _checkSparkFlag = false;  // checkSparkEffect 返回 true 时设置
var _sparkStackLogCount = 0;  // v15: stack trace 日志计数
var _getEntityCallCount = 0;  // v15: getEntityOfUID 调用计数
// v17: Buff/Collapse guard — 工厂化
var _guardOrigFuncs = {};   // {methodName: origFunction}
var _guardCounters = { buff: 0, collapse: 0 };

// v17 Guard Hook 工厂 — defineProperty accessor 包装原型方法
// 触发时激活 _sparkGuardActive，setTimeout 后自动恢复
// mode='on': 标准守卫（激活+超时恢复）  mode='off': 关闭守卫（仅当已激活时生效）
function _hookGuardMethod(proto, name, ownKeys, cfg, depth, ctorName) {
    if (ownKeys.indexOf(name) < 0) return false;
    if (typeof proto[name] !== 'function' || _guardOrigFuncs[name]) return false;
    _guardOrigFuncs[name] = proto[name];
    var origFn = _guardOrigFuncs[name];
    var logPrefix = cfg.logPrefix;
    var counterKey = cfg.counterKey;
    var timeoutMs = cfg.timeoutMs;
    var mode = cfg.mode || 'on';  // 'on' | 'off'

    var makeOnWrapper = function (self, origFn) {
        return function _guardOn() {
            if (globalThis._animSkipEnabled) {
                _guardCounters[counterKey]++;
                _sparkGuardActive = true;
                globalThis._speedLog('[' + logPrefix + '] >>> ON: ' + name + ' #' + _guardCounters[counterKey] + ' (timeout: ' + timeoutMs + 'ms)');
                if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
                _sparkGuardTimer = setTimeout(function () {
                    _sparkGuardActive = false;
                    globalThis._speedLog('[' + logPrefix + '] <<< auto-resume ' + timeoutMs + 'ms');
                }, timeoutMs);
            }
            return origFn.apply(self, arguments);
        };
    };
    var makeOffWrapper = function (self, origFn) {
        return function _guardOff() {
            if (globalThis._animSkipEnabled && _sparkGuardActive) {
                globalThis._speedLog('[' + logPrefix + '] ' + name + ' → schedule OFF ' + timeoutMs + 'ms');
                if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
                _sparkGuardTimer = setTimeout(function () {
                    _sparkGuardActive = false;
                    globalThis._speedLog('[' + logPrefix + '] <<< OFF via ' + name + ' (timeout: ' + timeoutMs + 'ms)');
                }, timeoutMs);
            }
            return origFn.apply(self, arguments);
        };
    };
    var makeWrapper = (mode === 'off') ? makeOffWrapper : makeOnWrapper;

    try {
        Object.defineProperty(proto, name, {
            get: function () { return makeWrapper(this, origFn); },
            configurable: true,
            enumerable: true
        });
    } catch (e) {
        // defineProperty 失败时 fallback 到直接赋值
        proto[name] = function () { return makeWrapper(this, origFn).apply(this, arguments); };
    }
    globalThis._speedLog('[PROTO] Hooked ' + name + ' on L' + depth + ':' + ctorName);
    return true;
}

// v14: 多信号 R-Spark 检测函数 (M1-M4 仍作为 showSparkEffect accessor 的辅助检测)
// 返回检测方法名 (string) 或 false
function _detectRSpark(entity, args) {
    var a2_val = args.length > 0 ? args[0] : undefined;
    var isShow = !!a2_val;
    if (!isShow) return false;  // 移除特效的调用，不是 R-Spark

    // M1: entity 自身的 ready_spark (unit_card 对象可能有)
    try {
        if (entity.ready_spark || entity.ready_red_spark) return 'M1:this.ready_spark';
    } catch (e) { }

    // M2: 参数类型检查
    // selectCardRSpark 传递 ready_spark 数据(可能是卡牌ID/对象,非 boolean)
    // 普通 spark 传递 true/false
    try {
        if (typeof a2_val !== 'boolean' && a2_val !== 1 && a2_val !== 0) {
            return 'M2:non-boolean-arg(' + typeof a2_val + ':' + String(a2_val).substring(0, 30) + ')';
        }
    } catch (e) { }

    // M3: checkSparkEffect 在最近调用中返回了 true
    if (_checkSparkFlag) {
        _checkSparkFlag = false;
        return 'M3:checkSparkEffect';
    }

    // M4: BattleHelper.battle_stage 路径检查
    try {
        var bh = globalThis['BattleHelper'];
        if (bh) {
            // 检查 BattleHelper 的静态属性
            var bs = bh.battle_stage || bh.prototype.battle_stage;
            if (bs && bs.logic) {
                // selectCardRSpark 设置 this.cards = true  
                if (bs.logic.cards === true) return 'M4:logic.cards=true';
            }
        }
    } catch (e) { }

    return false;
}

// v16: Hook BattleEventManager.emit 使用 Object.defineProperty accessor
// 字节码证实: emit(type, detail, opts) → new EventBase(type, opts, detail) → this.dispatchEvent()
// Object.defineProperty accessor 在 showSparkEffect 上已证明可绕过 V8 IC (sparkCalls=89)
// 
// 保护的事件类型:
//   ON_SPARK_START / ON_SPARK_END   — 灵光一闪 (spark card selection)
//   ADD_CS / CHANGE_CS              — Buff/状态施加
//   BREAK_IN                        — 崩溃动画
//   ON_CUTIN_START / ON_CUTIN_END   — 演出动画
//   ON_START_FATAL_ATTACK / ON_END_FATAL_ATTACK — 必杀技

var _bemEmitCallCount = 0;
var _bemDispatchCallCount = 0;
var _MAX_BEM_LOGS = 200;

// 需要保护的事件 → guard 持续时间(ms), 0 = 由对应 END 事件关闭
var _guardEvents = {
    'ON_SPARK_START': 0,          // 由 ON_SPARK_END 关闭
    'ON_CUTIN_START': 0,          // 由 ON_CUTIN_END 关闭
    'ON_START_FATAL_ATTACK': 0,   // 由 ON_END_FATAL_ATTACK 关闭
    'ON_LEAD_START': 0,           // 由 ON_LEAD_END 关闭
    'ADD_CS': 3000,               // Buff 施加 — 3秒后自动恢复
    'BREAK_IN': 4000              // 崩溃 — 4秒后自动恢复
};
var _guardEndEvents = {
    'ON_SPARK_END': true,
    'ON_CUTIN_END': true,
    'ON_END_FATAL_ATTACK': true,
    'ON_LEAD_END': true
};

function _checkBemEventGuard(eventType) {
    var typeStr = '';
    try {
        // eventType 可能是 EventBase 对象 (有 .type 属性) 或直接是字符串
        if (eventType && typeof eventType === 'object' && eventType.type) {
            typeStr = String(eventType.type);
        } else {
            typeStr = String(eventType);
        }
    } catch (e) { return; }

    if (!typeStr || !globalThis._animSkipEnabled) return;

    // 检查是否是保护事件 (guard ON)
    if (_guardEvents.hasOwnProperty(typeStr)) {
        _sparkGuardActive = true;
        globalThis._speedLog('[GUARD] >>> ON: ' + typeStr);

        var duration = _guardEvents[typeStr];
        if (duration > 0) {
            // 定时自动恢复
            if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
            _sparkGuardTimer = setTimeout(function () {
                _sparkGuardActive = false;
                globalThis._speedLog('[GUARD] <<< auto-resume after ' + duration + 'ms (' + typeStr + ')');
            }, duration);
        }
    }

    // 检查是否是结束事件 (guard OFF)
    if (_guardEndEvents.hasOwnProperty(typeStr)) {
        // 延迟关闭，确保最后的动画/UI 完成
        var offDelay = (typeStr === 'ON_SPARK_END') ? 1500 : 800;
        if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
        _sparkGuardTimer = setTimeout(function () {
            _sparkGuardActive = false;
            globalThis._speedLog('[GUARD] <<< OFF: ' + typeStr + ' (delayed ' + offDelay + 'ms)');
        }, offDelay);
        globalThis._speedLog('[GUARD] <<< scheduling OFF: ' + typeStr + ' in ' + offDelay + 'ms');
    }
}


function _hookEntityPlayAnimation(enable) {
    var entities = _collectEntities();
    // getEntityOfUID 拦截器缓存的实体（_collectEntities 搜不到时的后备）
    if (entities.length === 0 && _cachedInterceptEntity) {
        entities = [_cachedInterceptEntity];
    }

    if (enable) {
        var hookCount = 0;

        // === 策略 1: Prototype-level hook ===
        // 找到 playAnimation 定义在原型链的哪一层，直接修改那个 prototype
        if (!_protoHooked && entities.length > 0) {
            var ent = entities[0];

            // --- 探测 entity 原型链 ---
            try {
                var proto = Object.getPrototypeOf(ent);
                var depth = 0;
                var protoChainLog = [];
                while (proto && depth < 10) {
                    var ownKeys = [];
                    try { ownKeys = Object.getOwnPropertyNames(proto); } catch (e) { }
                    var hasPlayAnim = ownKeys.indexOf('playAnimation') >= 0;
                    var constructorName = '';
                    try { constructorName = proto.constructor ? proto.constructor.name : ''; } catch (e) { }
                    protoChainLog.push('L' + depth + ':' + constructorName +
                        '(keys=' + ownKeys.length +
                        ',playAnim=' + hasPlayAnim + ')');

                    if (hasPlayAnim && typeof proto.playAnimation === 'function' && !_origProtoPlayAnimation) {
                        _origProtoPlayAnimation = proto.playAnimation;
                        proto.playAnimation = function (animName, loop) {
                            if (_playAnimLogCount < _MAX_PLAY_LOGS) {
                                _playAnimLogCount++;
                                var label = '';
                                try { label = this.getName ? this.getName() : ''; } catch (e) { }
                                globalThis._speedLog('[PLAY-P] ' + label +
                                    ' "' + animName + '"' +
                                    ' loop=' + loop +
                                    ' skip=' + (globalThis._animSkipEnabled && !_sparkGuardActive && !loop));
                            }

                            if (globalThis._animSkipEnabled && !_sparkGuardActive && !loop) {
                                _origProtoPlayAnimation.call(this, animName, loop);
                                return 0.001;
                            }
                            return _origProtoPlayAnimation.call(this, animName, loop);
                        };
                        hookCount++;
                        globalThis._speedLog('[PROTO] Hooked playAnimation on prototype L' + depth + ':' + constructorName);
                    }

                    // === v15: Hook showSparkEffect via Object.defineProperty accessor ===
                    // v14 的直接赋值被 V8 IC 绕过，v15 改用 accessor property
                    var hasShowSpark = ownKeys.indexOf('showSparkEffect') >= 0;
                    if (hasShowSpark && typeof proto.showSparkEffect === 'function' && !_origProtoShowSparkEffect) {
                        _origProtoShowSparkEffect = proto.showSparkEffect;
                        try {
                            Object.defineProperty(proto, 'showSparkEffect', {
                                get: function () {
                                    var self = this;
                                    return function _showSparkEffect_hook() {
                                        if (globalThis._animSkipEnabled && _sparkCallCount < _MAX_SPARK_LOGS) {
                                            _sparkCallCount++;
                                            var a2v = arguments.length > 0 ? arguments[0] : 'N/A';
                                            globalThis._speedLog('[SPARK-CALL#' + _sparkCallCount + '] arg=' + String(a2v).substring(0, 50) + ' type=' + typeof a2v);
                                            // 前5次调用记录实体 spark 属性
                                            if (_sparkCallCount <= 5) {
                                                try {
                                                    var sparkKeys = ['ready_spark', 'ready_red_spark', 'spark_id', 'r_spark', 'y_spark', 'r_spark_candis', 'cards', 'char_id', 'uid'];
                                                    var found = [];
                                                    for (var sk = 0; sk < sparkKeys.length; sk++) {
                                                        var sv = self[sparkKeys[sk]];
                                                        if (sv !== undefined) found.push(sparkKeys[sk] + '=' + sv);
                                                    }
                                                    globalThis._speedLog('[SPARK-ENT] props: ' + (found.length > 0 ? found.join(', ') : '(none)'));
                                                } catch (e) { }
                                            }
                                        }
                                        var method = _detectRSpark(self, arguments);
                                        if (method && globalThis._animSkipEnabled) {
                                            _sparkGuardActive = true;
                                            globalThis._speedLog('[SPARK] >>> R-SPARK GUARD ON via ' + method);
                                            if (_sparkGuardTimer) clearTimeout(_sparkGuardTimer);
                                            _sparkGuardTimer = setTimeout(function () {
                                                _sparkGuardActive = false;
                                            }, 15000);
                                        }
                                        return _origProtoShowSparkEffect.apply(self, arguments);
                                    };
                                },
                                configurable: true,
                                enumerable: true
                            });
                        } catch (e) {
                            proto.showSparkEffect = function () {
                                var method = _detectRSpark(this, arguments);
                                if (method && globalThis._animSkipEnabled) {
                                    _sparkGuardActive = true;
                                }
                                return _origProtoShowSparkEffect.apply(this, arguments);
                            };
                        }
                        hookCount++;
                        globalThis._speedLog('[PROTO] Hooked showSparkEffect via defineProperty on L' + depth + ':' + constructorName);
                    }

                    // === v14: Hook checkSparkEffect — R-Spark 候选卡牌检查 ===
                    var hasCheckSpark = ownKeys.indexOf('checkSparkEffect') >= 0;
                    if (hasCheckSpark && typeof proto.checkSparkEffect === 'function' && !_origProtoCheckSparkEffect) {
                        _origProtoCheckSparkEffect = proto.checkSparkEffect;
                        proto.checkSparkEffect = function () {
                            var result = _origProtoCheckSparkEffect.apply(this, arguments);
                            if (result && globalThis._animSkipEnabled) {
                                _checkSparkFlag = true;
                                globalThis._speedLog('[SPARK-CHECK] checkSparkEffect returned TRUE — R-Spark candidates exist');
                            }
                            return result;
                        };
                        hookCount++;
                        globalThis._speedLog('[PROTO] Hooked checkSparkEffect on prototype L' + depth + ':' + constructorName);
                    }

                    // === v17: Guard hooks via factory ===
                    var _guardDefs = [
                        { name: 'showBuffEffect', logPrefix: 'BUFF-GUARD', counterKey: 'buff', timeoutMs: 800, mode: 'on' },
                        { name: 'showDebuffEffect', logPrefix: 'BUFF-GUARD', counterKey: 'buff', timeoutMs: 800, mode: 'on' },
                        { name: 'showCollapseCardEffect', logPrefix: 'COLLAPSE-GUARD', counterKey: 'collapse', timeoutMs: 5000, mode: 'on' },
                        { name: 'turnOnCollapseAura', logPrefix: 'COLLAPSE-GUARD', counterKey: 'collapse', timeoutMs: 5000, mode: 'on' },
                        { name: 'turnOffCollapseAura', logPrefix: 'COLLAPSE-GUARD', counterKey: 'collapse', timeoutMs: 1500, mode: 'off' }
                    ];
                    for (var gi = 0; gi < _guardDefs.length; gi++) {
                        if (_hookGuardMethod(proto, _guardDefs[gi].name, ownKeys, _guardDefs[gi], depth, constructorName)) {
                            hookCount++;
                        }
                    }

                    proto = Object.getPrototypeOf(proto);
                    depth++;
                }
                globalThis._speedLog('[PROTO] entity chain: ' + protoChainLog.join(' → '));
            } catch (e) {
                globalThis._speedLog('[PROTO] entity chain error: ' + e);
            }

            // --- 探测 aninode 原型链 (setAnimation + getAnimationLength) ---
            try {
                var an = entities[0].aninode;
                if (an) {
                    var proto = Object.getPrototypeOf(an);
                    var depth = 0;
                    var aniProtoLog = [];
                    while (proto && depth < 10) {
                        var ownKeys = [];
                        try { ownKeys = Object.getOwnPropertyNames(proto); } catch (e) { }
                        var hasSetAnim = ownKeys.indexOf('setAnimation') >= 0;
                        var hasGetLen = ownKeys.indexOf('getAnimationLength') >= 0;
                        var constructorName = '';
                        try { constructorName = proto.constructor ? proto.constructor.name : ''; } catch (e) { }
                        aniProtoLog.push('L' + depth + ':' + constructorName +
                            '(setAnim=' + hasSetAnim +
                            ',getLen=' + hasGetLen + ')');

                        // Hook setAnimation on prototype
                        if (hasSetAnim && typeof proto.setAnimation === 'function' && !_origProtoSetAnimation) {
                            _origProtoSetAnimation = proto.setAnimation;
                            proto.setAnimation = function (track, animName, loop) {
                                if (_playAnimLogCount < _MAX_PLAY_LOGS) {
                                    _playAnimLogCount++;
                                    var label = '';
                                    try { label = this.getName ? this.getName() : ''; } catch (e) { }
                                    globalThis._speedLog('[ANIM-P] ' + label +
                                        ' "' + animName + '"' +
                                        ' loop=' + loop);
                                }
                                var result = _origProtoSetAnimation.call(this, track, animName, loop);
                                // 不吞掉动画，只记录触发
                                return result;
                            };
                            hookCount++;
                            globalThis._speedLog('[PROTO] Hooked setAnimation on aninode prototype L' + depth);
                        }

                        // Hook getAnimationLength on prototype
                        if (hasGetLen && typeof proto.getAnimationLength === 'function' && !_origProtoGetAnimLen) {
                            _origProtoGetAnimLen = proto.getAnimationLength;
                            proto.getAnimationLength = function (animName) {
                                var orig = _origProtoGetAnimLen.call(this, animName);
                                if (globalThis._animSkipEnabled) {
                                    if (_playAnimLogCount < _MAX_PLAY_LOGS) {
                                        _playAnimLogCount++;
                                        globalThis._speedLog('[LEN-P] "' + animName + '" orig=' + orig + ' → 0.001');
                                    }
                                    return 0.001;
                                }
                                return orig;
                            };
                            hookCount++;
                            globalThis._speedLog('[PROTO] Hooked getAnimationLength on aninode prototype L' + depth);
                        }

                        proto = Object.getPrototypeOf(proto);
                        depth++;
                    }
                    globalThis._speedLog('[PROTO] aninode chain: ' + aniProtoLog.join(' → '));
                }
            } catch (e) {
                globalThis._speedLog('[PROTO] aninode chain error: ' + e);
            }

            _protoHooked = true;
        }

        if (_timerHookLog < 10 && hookCount > 0) {
            _timerHookLog++;
            globalThis._speedLog('[TIMER] v12 hooked ' + hookCount + ' prototype methods');
        }

        return hookCount;
    } else {
        // Restore prototypes
        var restored = 0;
        if (_origProtoPlayAnimation && entities.length > 0) {
            try {
                var proto = Object.getPrototypeOf(entities[0]);
                var depth = 0;
                while (proto && depth < 10) {
                    if (Object.getOwnPropertyNames(proto).indexOf('playAnimation') >= 0) {
                        proto.playAnimation = _origProtoPlayAnimation;
                        restored++;
                        break;
                    }
                    proto = Object.getPrototypeOf(proto);
                    depth++;
                }
            } catch (e) { }
            _origProtoPlayAnimation = null;
        }
        if (_origProtoSetAnimation && entities.length > 0) {
            try {
                var an = entities[0].aninode;
                if (an) {
                    var proto = Object.getPrototypeOf(an);
                    var depth = 0;
                    while (proto && depth < 10) {
                        if (Object.getOwnPropertyNames(proto).indexOf('setAnimation') >= 0) {
                            proto.setAnimation = _origProtoSetAnimation;
                            restored++;
                            break;
                        }
                        proto = Object.getPrototypeOf(proto);
                        depth++;
                    }
                }
            } catch (e) { }
            _origProtoSetAnimation = null;
        }
        if (_origProtoGetAnimLen && entities.length > 0) {
            try {
                var an = entities[0].aninode;
                if (an) {
                    var proto = Object.getPrototypeOf(an);
                    var depth = 0;
                    while (proto && depth < 10) {
                        if (Object.getOwnPropertyNames(proto).indexOf('getAnimationLength') >= 0) {
                            proto.getAnimationLength = _origProtoGetAnimLen;
                            restored++;
                            break;
                        }
                        proto = Object.getPrototypeOf(proto);
                        depth++;
                    }
                }
            } catch (e) { }
            _origProtoGetAnimLen = null;
        }
        // Restore showSparkEffect + checkSparkEffect
        // v15: showSparkEffect 可能是 accessor property，需要用 Object.defineProperty 恢复
        if ((_origProtoShowSparkEffect || _origProtoCheckSparkEffect) && entities.length > 0) {
            try {
                var proto = Object.getPrototypeOf(entities[0]);
                var depth = 0;
                while (proto && depth < 10) {
                    var pKeys = Object.getOwnPropertyNames(proto);
                    if (_origProtoShowSparkEffect && pKeys.indexOf('showSparkEffect') >= 0) {
                        try {
                            Object.defineProperty(proto, 'showSparkEffect', {
                                value: _origProtoShowSparkEffect,
                                writable: true,
                                configurable: true,
                                enumerable: true
                            });
                        } catch (e2) {
                            proto.showSparkEffect = _origProtoShowSparkEffect;
                        }
                        restored++;
                    }
                    if (_origProtoCheckSparkEffect && pKeys.indexOf('checkSparkEffect') >= 0) {
                        proto.checkSparkEffect = _origProtoCheckSparkEffect;
                        restored++;
                    }
                    proto = Object.getPrototypeOf(proto);
                    depth++;
                }
            } catch (e) { }
            _origProtoShowSparkEffect = null;
            _origProtoCheckSparkEffect = null;
        }
        if (_sparkGuardTimer) {
            clearTimeout(_sparkGuardTimer);
            _sparkGuardTimer = null;
        }
        _protoHooked = false;
        _playAnimLogCount = 0;
        _timerHookLog = 0;
        return restored;
    }
}

// ---- Hook 4: timeSleep / waitForNextFrame — 战斗核心等待 ----
// framework.js 把这些挂到 globalThis 上：
//   timeSleep(ms)          → Promise, resolve after ms (Date.now based)
//   waitForNextFrame()     → Promise, resolve next frame
//   waitForNextFrames(n)   → Promise, resolve after n frames
// 战斗协程用 await timeSleep(ms) 等待动画完成
var _origTimeSleep = null;
var _origWaitForNextFrame = null;
var _origWaitForNextFrames = null;
var _tsHookCount = 0;
var _tsSkipCount = 0;

function _hookTimeSleep() {
    // Hook timeSleep — 这是战斗中最关键的等待
    try {
        var ts = globalThis['timeSleep'];
        if (ts && typeof ts === 'function' && !_origTimeSleep) {
            _origTimeSleep = ts;
            globalThis['timeSleep'] = function (ms) {
                _tsHookCount++;
                if (globalThis._animSkipEnabled && !_sparkGuardActive) {
                    _tsSkipCount++;
                    return _origTimeSleep(1);
                }
                return _origTimeSleep(ms);
            };
            globalThis._speedLog('[SKIP] Hooked globalThis.timeSleep');
        } else {
            globalThis._speedLog('[SKIP] timeSleep not found on globalThis, type=' + typeof ts);
        }
    } catch (e) {
        globalThis._speedLog('[SKIP] timeSleep hook err: ' + e);
    }

    // Hook waitForNextFrame — 用 setTimeout(1ms) 代替等下一帧
    // 之前担心死循环，但 setTimeout 会 yield 到事件循环，不会阻塞
    // 原始等待 ~16ms/帧，现在 ~1ms → 轮询循环快 16 倍
    try {
        var wnf = globalThis['waitForNextFrame'];
        if (wnf && typeof wnf === 'function' && !_origWaitForNextFrame) {
            _origWaitForNextFrame = wnf;
            globalThis['waitForNextFrame'] = function () {
                if (globalThis._animSkipEnabled && !_sparkGuardActive) {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 0);
                    });
                }
                return _origWaitForNextFrame();
            };
            globalThis._speedLog('[SKIP] Hooked waitForNextFrame → setTimeout(0)');
        } else {
            globalThis._speedLog('[SKIP] waitForNextFrame: type=' + typeof wnf);
        }
    } catch (e) {
        globalThis._speedLog('[SKIP] waitForNextFrame hook err: ' + e);
    }

    // Hook waitForNextFrames 同理
    try {
        var wnfs = globalThis['waitForNextFrames'];
        if (wnfs && typeof wnfs === 'function' && !_origWaitForNextFrames) {
            _origWaitForNextFrames = wnfs;
            globalThis['waitForNextFrames'] = function (n) {
                if (globalThis._animSkipEnabled && !_sparkGuardActive) {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 0);
                    });
                }
                return _origWaitForNextFrames(n);
            };
            globalThis._speedLog('[SKIP] Hooked waitForNextFrames → setTimeout(0)');
        }
    } catch (e) { }

    // 也探测 SimpleWait（之前的目标）
    try {
        var sw = globalThis['SimpleWait'];
        if (sw && typeof sw === 'function') {
            var origSW = sw;
            globalThis['SimpleWait'] = function (ms) {
                if (globalThis._animSkipEnabled && !_sparkGuardActive && ms > 16) {
                    return origSW(1);
                }
                return origSW(ms);
            };
            globalThis._speedLog('[SKIP] Hooked globalThis.SimpleWait');
        }
    } catch (e) { }
}

// ---- 主切换函数 ----
// v8: 跳过动画 — setAnimation hook
//   1. timeSleep hook → 缩短逻辑等待
//   2. setAnimation hook → 动画开始后立刻跳到结束
//   3. DelayTime hook → 完成回调 0.001s 触发
//   → 整个出牌/攻击流程秒完成
var _entityTimer = null;

function _toggleCardSkip() {
    if (typeof globalThis._startGlobalKeepAlive === 'function' && globalThis._speedBtn) _startGlobalKeepAlive(globalThis._speedBtn);
    globalThis._animSkipEnabled = !globalThis._animSkipEnabled;

    if (globalThis._animSkipEnabled) {
        globalThis._speedLog('=== ANIMATION SKIP v17: ON (buff/collapse EntityActor guard) ===');
        _sparkCallCount = 0;
        _sparkStackLogCount = 0;
        _getEntityCallCount = 0;
        _bemEmitCallCount = 0;
        _bemDispatchCallCount = 0;
        _guardCounters.buff = 0;
        _guardCounters.collapse = 0;

        _hookDelayTime();
        _hookFadeAnimations();
        _hookTimeSleep();

        // 动画跳过需要方案4(BattleStage原型链)和黑科技7(Map投毒)提供的 spark 守卫信息
        // 两个函数都有幂等保护，不会重复安装
        try { _installComprehensiveSparkGuard(); } catch (e) { }
        try { _installSparkGuard(); } catch (e) { }


        // Hook 战斗实体的 playAnimation + getAnimationLength (v11)
        var hookCount = _hookEntityPlayAnimation(true);
        globalThis._speedLog('[SKIP] Hooked playAnimation+getAnimLen on ' + hookCount + ' targets');


        // 定时器持续 hook 新实体
        if (_entityTimer) clearInterval(_entityTimer);
        _entityTimer = setInterval(function () {
            if (!globalThis._animSkipEnabled) return;
            _hookEntityPlayAnimation(true);
        }, 500);

    } else {
        globalThis._speedLog('=== ANIMATION SKIP v17: OFF ===');
        globalThis._speedLog('[SKIP] Stats: delayHook=' + _skipStats.delayHooked +
            ' delaySkip=' + _skipStats.delaySkipped +
            ' tsHook=' + _tsHookCount +
            ' tsSkip=' + _tsSkipCount +
            ' entityCalls=' + _getEntityCallCount +
            ' sparkCalls=' + _sparkCallCount +
            ' buffGuard=' + _guardCounters.buff +
            ' collapseGuard=' + _guardCounters.collapse +
            ' bemEmit=' + _bemEmitCallCount +
            ' bemDispatch=' + _bemDispatchCallCount);

        // 停止定时器
        if (_entityTimer) {
            clearInterval(_entityTimer);
            _entityTimer = null;
        }

        // 恢复所有 playAnimation + getAnimLen hooks (v11)
        var restored = _hookEntityPlayAnimation(false);
        globalThis._speedLog('[SKIP] Restored ' + restored + ' playAnimation+getAnimLen hooks');


        _sparkGuardActive = false;
    }

    _updateSpeedLabel();
}



    var AnimSkipService = {
        _toggleCardSkip: _toggleCardSkip,
        _hookDelayTime: _hookDelayTime,
        _hookFadeAnimations: _hookFadeAnimations,
        _hookTimeSleep: _hookTimeSleep,
    };
    __app.registerService('AnimSkipService', AnimSkipService);
    globalThis._toggleCardSkip = _toggleCardSkip;
    globalThis._hookDelayTime = _hookDelayTime;
    globalThis._hookFadeAnimations = _hookFadeAnimations;
    globalThis._hookTimeSleep = _hookTimeSleep;
})();
// --- [MODULE END] 07_anim_skip.js ---

// --- End of 07_anim_skip.js ---
