// --- [MODULE START] 06_spark_guard.js ---
(function() {
    var SparkGuardService = {
        _sparkGuardActive: false,
        _sparkGuardInstalled: false,

        install: function() {
            if (this._sparkGuardInstalled) return;
            try {
                var BH = globalThis.BattleHelper;
                if (!BH) {
                    globalThis._speedLog('[SPARK GUARD] BattleHelper not found — will retry later');
                    return;
                }
                if (!BH.battle_stage) {
                    globalThis._speedLog('[SPARK GUARD] BattleHelper.battle_stage is null — wait for combat');
                    return;
                }
                this._sparkGuardInstalled = true;
                globalThis._sparkGuardInstalled = true;
                globalThis._speedLog('[SPARK GUARD] ═══ Installation complete ═══');
            } catch (e) {
                globalThis._speedLog('[SPARK GUARD] Install error: ' + e);
            }
        },

        installComprehensive: function() {
            if (globalThis._comprehensiveSparkGuardInstalled && globalThis._comprehensiveSparkGuardPhase4Done) return;
            if (!globalThis._comprehensiveSparkGuardInstalled) {
                globalThis._speedLog('[SPARK V20] 安装方案 4 + 黑科技 7...');
                globalThis._comprehensiveSparkGuardInstalled = true;
            }

            try {
                function _findClass(className) {
                    var Cls = null;
                    if (typeof globalThis[className] !== 'undefined') Cls = globalThis[className];
                    else if (typeof window !== 'undefined' && window[className]) Cls = window[className];
                    if (!Cls && typeof require !== 'undefined') {
                        try { Cls = require(className); } catch(e) {}
                        if (!Cls) try { Cls = require('game/' + className.toLowerCase().replace(/ui$/, '_ui').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')); } catch(e) {}
                        if (!Cls) try { Cls = require('game_ui/ingame/deck/' + className.toLowerCase().replace(/ui$/, '_ui').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')); } catch(e) {}
                    }
                    if (!Cls && typeof cc !== 'undefined' && cc.js && cc.js.getClassByName) {
                        try { Cls = cc.js.getClassByName(className); } catch(e) {}
                    }
                    if (Cls && Cls[className]) Cls = Cls[className];
                    return Cls;
                }

                if (!globalThis._rsparkManagerHooked) {
                    var RM = _findClass('RSparkManager');
                    if (RM && typeof RM.createRSparkSelectPopup === 'function' && !RM._v20hook_createRSparkSelectPopup) {
                        var origRM = RM.createRSparkSelectPopup;
                        var self = this;
                        RM.createRSparkSelectPopup = function () {
                            globalThis._speedLog('[SPARK V20] 🛡️ 方案4 拦截: createRSparkSelectPopup 进入 → 强制 1x 保护');
                            globalThis._rsparkSelectActive = true;
                            self._sparkGuardActive = true;
                            globalThis._sparkGuardActive = true;
                            
                            var sg = __app.getService('SparkGuardService');
                            if (sg) sg.installRSparkUpdateHook();

                            try {
                                cc.Director.getInstance().getScheduler().setTimeScale(1);
                                var dir = cc.Director.getInstance();
                                if (typeof dir.getSchedulerByIndex === 'function') {
                                    for (var si = 0; si < 5; si++) {
                                        try { var s = dir.getSchedulerByIndex(si); if (s && typeof s.setTimeScale === 'function') s.setTimeScale(1); } catch (e) { }
                                    }
                                }
                                if (typeof yuna !== 'undefined' && yuna.setenv) yuna.setenv('time_scale', 1);
                            } catch (e) { globalThis._speedLog('[SPARK V20] 方案4 降速失败: ' + e); }

                            var result = origRM.apply(this, arguments);

                            try {
                                var scene = cc.Director.getInstance().getRunningScene();
                                if (scene) {
                                    var delay = cc.DelayTime.create(3);
                                    var restore = cc.CallFunc.create(function () {
                                        var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                        globalThis._speedLog('[SPARK V20] 🚀 createRSparkSelectPopup 3秒延时结束 → 恢复 ' + curSpeed + 'x 加速');
                                        globalThis._rsparkSelectActive = false;
                                        self._sparkGuardActive = false;
                                        globalThis._sparkGuardActive = false;
                                        if (curSpeed > 1 && typeof globalThis._applySpeed === 'function') {
                                            globalThis._applySpeed(curSpeed);
                                        }
                                    });
                                    scene.runAction(cc.Sequence.create(delay, restore));
                                }
                            } catch (e) { globalThis._speedLog('[SPARK V20] ⚠️ 延时恢复安装失败: ' + e); }

                            return result;
                        };
                        RM._v20hook_createRSparkSelectPopup = true;
                        globalThis._rsparkManagerHooked = true;
                        globalThis._speedLog('[SPARK V20] ✅ RSparkManager.createRSparkSelectPopup 延时防护 Hook 安装成功');
                    }
                }

                if (!globalThis._gameCardSelectUIHooked) {
                    var UI = _findClass('GameCardSelectUI');
                    if (UI) {
                        var methods = ['createUI', 'createNonbattleUI'];
                        var hookedCount = 0;
                        for (var i = 0; i < methods.length; i++) {
                            (function(mName) {
                                if (typeof UI[mName] === 'function' && !UI['_v20hook_' + mName]) {
                                    var origUI = UI[mName];
                                    UI[mName] = function() {
                                        globalThis._speedLog('[SPARK V20] 🎯 Layer 6 信号激活: ' + mName + ' → globalThis._rsparkSelectActive = true');
                                        globalThis._rsparkSelectActive = true;
                                        return origUI.apply(this, arguments);
                                    };
                                    UI['_v20hook_' + mName] = true;
                                    hookedCount++;
                                }
                            })(methods[i]);
                        }
                        if (hookedCount > 0) {
                            globalThis._gameCardSelectUIHooked = true;
                            globalThis._speedLog('[SPARK V20] ✅ GameCardSelectUI 选牌全局信号 Hook 安装成功');
                        }
                    }
                }

                if (globalThis._rsparkManagerHooked || globalThis._gameCardSelectUIHooked) {
                    globalThis._comprehensiveSparkGuardPhase4Done = true;
                }
            } catch (e) {
                globalThis._speedLog('[SPARK V20] 方案 4 安装失败: ' + e);
            }

            try {
                if (typeof Map !== 'undefined' && Map.prototype.set && !Map.prototype._v20_hooked) {
                    var origMapSet = Map.prototype.set;
                    var selfMap = this;
                    Map.prototype.set = function (k, v) {
                        if (k === 'ON_SPARK_START' || k === 'ON_SPARK_END' || (typeof k === 'string' && k.indexOf('SPARK') !== -1)) {
                            globalThis._speedLog('[SPARK V20] 🔮 黑科技 7 (Map.set) 捕获对 ' + k + ' 的注册');
                            var wrapListenerObj = function (item, key) {
                                if (typeof item === 'function' && !item._v20_hooked) {
                                    var origCb = item;
                                    var newCb = function () {
                                        globalThis._speedLog('[SPARK V20] 🚀 Map Listener(Func) 触发了! 事件: ' + key);
                                        if (key === 'ON_SPARK_START') { 
                                            selfMap._sparkGuardActive = true; 
                                            globalThis._sparkGuardActive = true; 
                                            try { cc.Director.getInstance().getScheduler().setTimeScale(1); if (typeof yuna !== 'undefined' && yuna.setenv) yuna.setenv('time_scale', 1); } catch (e) { } 
                                        } else if (key === 'ON_SPARK_END') { 
                                            selfMap._sparkGuardActive = false; 
                                            globalThis._sparkGuardActive = false; 
                                            var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                            if (curSpeed > 1 && typeof globalThis._applySpeed === 'function') globalThis._applySpeed(curSpeed); 
                                        }
                                        return origCb.apply(this, arguments);
                                    };
                                    newCb._v20_hooked = true;
                                    return newCb;
                                } else if (item && typeof item === 'object') {
                                    var targetProp = null;
                                    if (typeof item.callback === 'function') targetProp = 'callback';
                                    else if (typeof item.handler === 'function') targetProp = 'handler';
                                    else if (typeof item.cb === 'function') targetProp = 'cb';

                                    if (targetProp && !item[targetProp]._v20_hooked) {
                                        var origCb2 = item[targetProp];
                                        item[targetProp] = function () {
                                            globalThis._speedLog('[SPARK V20] 🚀 Map Listener(' + targetProp + ') 触发了! 事件: ' + key);
                                            if (key === 'ON_SPARK_START') { 
                                                selfMap._sparkGuardActive = true; 
                                                globalThis._sparkGuardActive = true; 
                                                try { cc.Director.getInstance().getScheduler().setTimeScale(1); if (typeof yuna !== 'undefined' && yuna.setenv) yuna.setenv('time_scale', 1); } catch (e) { } 
                                            } else if (key === 'ON_SPARK_END') { 
                                                selfMap._sparkGuardActive = false; 
                                                globalThis._sparkGuardActive = false; 
                                                var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                                if (curSpeed > 1 && typeof globalThis._applySpeed === 'function') globalThis._applySpeed(curSpeed); 
                                            }
                                            return origCb2.apply(this, arguments);
                                        };
                                        item[targetProp]._v20_hooked = true;
                                    }
                                    return item;
                                }
                                return item;
                            };

                            if (Array.isArray(v)) {
                                for (var i = 0; i < v.length; i++) v[i] = wrapListenerObj(v[i], k);
                                if (!v._v20_push_hooked) {
                                    var origPush = v.push;
                                    v.push = function (item) { return origPush.call(this, wrapListenerObj(item, k)); };
                                    v._v20_push_hooked = true;
                                }
                            } else {
                                v = wrapListenerObj(v, k);
                            }
                        }
                        return origMapSet.call(this, k, v);
                    };
                    Map.prototype._v20_hooked = true;
                    var origMapGet = Map.prototype.get;
                    Map.prototype.get = function (k) {
                        if (k === 'ON_SPARK_START') globalThis._speedLog('[SPARK V20] 👁️ Map.get ON_SPARK_START');
                        return origMapGet.apply(this, arguments);
                    };
                    globalThis._speedLog('[SPARK V20] ✅ 黑科技 7 (Map 原型拦截升级版) 安装成功');
                }
            } catch (e) { globalThis._speedLog('[SPARK V20] 黑科技 7 安装失败: ' + e); }
        },

        installRSparkUpdateHook: function() {
            if (globalThis._rsparkUpdateHooked) return;
            var hookedMethods = [];
            function _applyInstancePropertyHook(instance) {
                try {
                    if (instance.hasOwnProperty('press_time')) {
                        var actualPress = instance.press_time || 0;
                        Object.defineProperty(instance, 'press_time', {
                            get: function() { return actualPress; },
                            set: function(newVal) {
                                var oldVal = actualPress;
                                if (newVal > oldVal && (newVal - oldVal) < 1.0) {
                                    var dt = newVal - oldVal;
                                    var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                    if (curSpeed > 1 && dt > 0.030) dt = dt / curSpeed;
                                    actualPress = oldVal + dt;
                                } else {
                                    actualPress = newVal;
                                }
                            },
                            configurable: true
                        });
                        globalThis._speedLog('[LAYER 5] 🪝 实例级属性劫持成功: press_time');
                    }
                } catch(e) { globalThis._speedLog('[LAYER 5] ⚠️ 实例级劫持异常: ' + e); }
            }

            try {
                if (!globalThis._v20_bind_hooked) {
                    var origBind = Function.prototype.bind;
                    Function.prototype.bind = function(thisArg) {
                        var boundFn = origBind.apply(this, arguments);
                        try {
                            if (thisArg && typeof thisArg === 'object') {
                                var ctorName = thisArg.constructor ? thisArg.constructor.name : '';
                                var isSpark = false;
                                if (this.name === 'update') {
                                    if (ctorName.indexOf('Spark') !== -1 || ctorName.indexOf('Card') !== -1 || thisArg.root !== undefined) isSpark = true;
                                }
                                if (thisArg.hasOwnProperty('limit_press_time') || thisArg.hasOwnProperty('press_time')) {
                                    isSpark = true;
                                    if (!thisArg._v20_prop_hacked_in_bind) {
                                        _applyInstancePropertyHook(thisArg);
                                        thisArg._v20_prop_hacked_in_bind = true;
                                    }
                                }
                                if (isSpark) {
                                    globalThis._speedLog('[LAYER 5] 🎯 捕获到底层 bind: ' + (ctorName || 'Unknown') + ' -> 强制防守');
                                    var wrappedBoundFn = function() {
                                        var args = Array.prototype.slice.call(arguments);
                                        var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                        if (curSpeed > 1) {
                                            for (var i = 0; i < args.length; i++) {
                                                if (typeof args[i] === 'number' && !isNaN(args[i])) args[i] = args[i] / curSpeed;
                                            }
                                        }
                                        return boundFn.apply(this, args);
                                    };
                                    return wrappedBoundFn;
                                }
                            }
                        } catch(e) {}
                        return boundFn;
                    };
                    globalThis._v20_bind_hooked = true;
                    hookedMethods.push("Function.bind");
                }
            } catch(e) { globalThis._speedLog('[LAYER 5] ⚠️ bind 拦截失败: ' + e); }
            globalThis._rsparkUpdateHooked = true;
            globalThis._speedLog('[LAYER 5] 🛡️ 灵光精简版守护阵列已启动');
        },

        installUniqueSparkAmbushHook: function() {
            if (globalThis._uniqueSparkAmbushInstalled) return;
            try {
                var nodeProto = cc.Node.prototype;
                if (nodeProto && !nodeProto._v20_layer6_update_trap) {
                    var origDescriptor = Object.getOwnPropertyDescriptor(nodeProto, 'update');
                    var origUpdate = origDescriptor ? origDescriptor.value : undefined;
                    Object.defineProperty(nodeProto, 'update', {
                        get: function() {
                            if (this.hasOwnProperty('_v20_update_wrapped')) return this._v20_update_wrapped;
                            if (this.hasOwnProperty('_v20_update_raw')) return this._v20_update_raw;
                            return origUpdate;
                        },
                        set: function(fn) {
                            if (typeof fn !== 'function') {
                                Object.defineProperty(this, '_v20_update_raw', { value: fn, writable: true, configurable: true });
                                if (this.hasOwnProperty('_v20_update_wrapped')) delete this._v20_update_wrapped;
                                return;
                            }
                            var isSparkCandidate = false;
                            try {
                                if (fn.name === '' || fn.name === 'update') {
                                    if (globalThis._rsparkSelectActive) isSparkCandidate = true;
                                }
                            } catch(e) {}

                            if (isSparkCandidate && !fn._v20_layer6_wrapped) {
                                var origFn = fn;
                                var wrappedFn = function(dt) {
                                    var fixedDt = dt;
                                    var curSpeed = (typeof globalThis._SPEED_LEVELS !== 'undefined' && typeof globalThis._speedIdx !== 'undefined') ? globalThis._SPEED_LEVELS[globalThis._speedIdx] : 1;
                                    if (curSpeed > 1 && typeof fixedDt === 'number') fixedDt = dt / curSpeed;
                                    return origFn.call(this, fixedDt);
                                };
                                wrappedFn._v20_layer6_wrapped = true;
                                wrappedFn._v20_original = origFn;
                                globalThis._speedLog('[LAYER 6] 🎯 守株待兔! 捕获独特灵光 update 闭包');
                                Object.defineProperty(this, '_v20_update_wrapped', { value: wrappedFn, writable: true, configurable: true });
                                Object.defineProperty(this, '_v20_update_raw', { value: origFn, writable: true, configurable: true });
                                return;
                            }
                            Object.defineProperty(this, '_v20_update_raw', { value: fn, writable: true, configurable: true });
                            if (this.hasOwnProperty('_v20_update_wrapped')) delete this._v20_update_wrapped;
                        },
                        configurable: true,
                        enumerable: true
                    });
                    nodeProto._v20_layer6_update_trap = true;
                }
            } catch(e) { globalThis._speedLog('[LAYER 6] ⚠️ cc.Node.prototype.update setter trap 安装失败: ' + e); }
            globalThis._uniqueSparkAmbushInstalled = true;
            globalThis._speedLog('[LAYER 6] 🛡️ 独特灵光守株待兔阵列已启动');
        },

        ensureGuardsInstalled: function() {
            if (!this._sparkGuardInstalled) { try { this.install(); } catch (e) { } }
            if (!globalThis._comprehensiveSparkGuardInstalled || !globalThis._comprehensiveSparkGuardPhase4Done) {
                try { this.installComprehensive(); } catch (e) { }
            }
            if (!globalThis._rsparkUpdateHooked) { try { this.installRSparkUpdateHook(); } catch (e) { } }
            if (!globalThis._uniqueSparkAmbushInstalled) { try { this.installUniqueSparkAmbushHook(); } catch (e) { } }
        }
    };

    __app.registerService('SparkGuardService', SparkGuardService);

    // Provide legacy global names for backward compatibility
    globalThis._installSparkGuard = function() { SparkGuardService.install(); };
    globalThis._installComprehensiveSparkGuard = function() { SparkGuardService.installComprehensive(); };
    globalThis._ensureGuardsInstalled = function() { SparkGuardService.ensureGuardsInstalled(); };
    globalThis._installRSparkUpdateHook = function() { SparkGuardService.installRSparkUpdateHook(); };
    globalThis._installUniqueSparkAmbushHook = function() { SparkGuardService.installUniqueSparkAmbushHook(); };
    globalThis._sparkGuardActive = false; // Initial sync
})();
// --- [MODULE END] 06_spark_guard.js ---

// --- End of 06_spark_guard.js ---
