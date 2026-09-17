// ==UserScript==
// @name         牛马助手反调试解除脚本
// @namespace    https://xiaocan-assistant.local/
// @version      1.0
// @description  一键解除牛马助手的 F12 屏蔽与 debugger 陷阱
// @match        https://www.xn--7frs77ao7li62b.top/*
// @match        https://*.xn--7frs77ao7li62b.top/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('%c[反调试解除器] 正在注入拦截钩子...', 'color:#10b981;font-weight:bold;');

  // 1. Hook Function.prototype.constructor 拦截 (function(){return false}).constructor('debugger')()
  const _origCtor = Function.prototype.constructor;
  Function.prototype.constructor = function(str) {
    if (typeof str === 'string' && str.includes('debugger')) {
      return function() {};
    }
    return _origCtor.apply(this, arguments);
  };

  // 保护全局 Function
  const _origFunction = window.Function;
  window.Function = function(...args) {
    if (args.some(a => typeof a === 'string' && a.includes('debugger'))) {
      return function() {};
    }
    return _origFunction.apply(this, args);
  };
  window.Function.prototype = _origFunction.prototype;
  window.Function.prototype.constructor = Function.prototype.constructor;

  // 2. Hook console.log 拦截 DevTools 时间差检测 和 Image getter 陷阱
  const _origLog = console.log.bind(console);
  console.log = function(...args) {
    // 拦截 color:red 时间差探测
    if (args.length >= 2 && args[0] === '%c' && typeof args[1] === 'string' && args[1].includes('color:red')) {
      return;
    }
    // 拦截 Image 探针
    if (args.length > 0 && args[0] && (args[0] instanceof Image || args[0].nodeName === 'IMG' || (typeof args[0] === 'object' && 'id' in args[0]))) {
      return;
    }
    return _origLog.apply(this, args);
  };

  // 3. 拦截 keydown 阻止牛马助手屏蔽 F12 / Ctrl+Shift+I / Ctrl+U
  const _origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'keydown' && typeof listener === 'function') {
      const wrapped = function(e) {
        if (e.key === 'F12' || e.keyCode === 123 || 
           (e.ctrlKey && e.shiftKey && /^[IJCijc]$/.test(e.key)) ||
           (e.ctrlKey && /^[Uu]$/.test(e.key))) {
          return;
        }
        return listener.apply(this, arguments);
      };
      return _origAddEventListener.call(this, type, wrapped, options);
    }
    return _origAddEventListener.call(this, type, listener, options);
  };

  console.log('%c[反调试解除器] 注入完成！F12、debugger陷阱与控制台检测已全部解除。', 'color:#10b981;font-weight:bold;');
})();