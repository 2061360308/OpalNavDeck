// @ts-nocheck
// NOTE: this file is injected into the sandbox as raw JS, so it cannot import
// shared/src/bridge.ts. Its protocol literals (__desk, kind, gesture/event
// names) MUST match that module.
;(function () {
  var seq = 0
  var pending = {}
  var handlers = {}
  var mountFn = null
  var ready = false
  var dragMode = 'always'
  var draggable = true

  function post(msg) {
    parent.postMessage(msg, '*')
  }

  function send(method, params) {
    return new Promise(function (resolve) {
      var id = ++seq
      pending[id] = resolve
      post({ __desk: 1, kind: 'rpc', id: id, method: method, params: params || {} })
    })
  }

  function notify(method, params) {
    post({ __desk: 1, kind: 'rpc', id: 0, method: method, params: params || {} })
  }

  function emit(name, data) {
    var list = handlers[name] || []
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](data)
      } catch (e) {
        /* ignore */
      }
    }
  }

  /* ---- dynamic desk built from the host capability schema ---- */
  var desk = {}

  desk.on = function (name, fn) {
    ;(handlers[name] = handlers[name] || []).push(fn)
  }
  desk.mount = function (fn) {
    mountFn = fn
    if (ready) startMount()
  }

  function makeMethod(ns, method) {
    return function (params) {
      return send(ns + '.' + method, params || {})
    }
  }

  function buildDesk(schema) {
    // drop previously built dynamic namespaces (keep helpers)
    Object.keys(desk).forEach(function (k) {
      if (k !== 'on' && k !== 'mount') delete desk[k]
    })
    for (var i = 0; i < schema.length; i++) {
      var item = schema[i]
      if (!item || !item.namespace) continue
      var parts = String(item.namespace).split('.')
      var node = desk
      for (var j = 0; j < parts.length; j++) {
        if (!node[parts[j]]) node[parts[j]] = {}
        node = node[parts[j]]
      }
      var methods = item.methods || []
      for (var k = 0; k < methods.length; k++) {
        node[methods[k]] = makeMethod(item.namespace, methods[k])
      }
    }
  }

  function startMount() {
    if (typeof mountFn === 'function') {
      try {
        mountFn(desk)
      } catch (e) {
        console.error('[skin] mount failed', e)
      }
    }
  }

  /* ---- gesture: whole-widget drag (bubble-phase, opt-out via stopPropagation) ---- */
  var drag = null

  function onPointerDown(e) {
    if (e.button !== 0 || e.isPrimary === false) return
    if (!draggable || dragMode === 'handle') return
    if (dragMode === 'alt' && !e.altKey) return
    notify('gesture.down')
    drag = { sx: e.screenX, sy: e.screenY, moved: false }
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)
  }

  function onPointerMove(e) {
    if (!drag) return
    var dx = e.screenX - drag.sx
    var dy = e.screenY - drag.sy
    if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
      drag.moved = true
      document.documentElement.style.userSelect = 'none'
      document.documentElement.style.cursor = 'grabbing'
      notify('gesture.dragstart')
    }
    if (drag.moved) {
      e.preventDefault()
      notify('gesture.dragmove', { dx: dx, dy: dy })
    }
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerUp, true)
    document.documentElement.style.userSelect = ''
    document.documentElement.style.cursor = ''
    if (drag && drag.moved) {
      notify('gesture.dragend')
      var suppress = function (ev) {
        ev.stopPropagation()
        ev.preventDefault()
        window.removeEventListener('click', suppress, true)
      }
      window.addEventListener('click', suppress, true)
    }
    drag = null
  }

  function onContextMenu(e) {
    e.preventDefault()
    notify('contextmenu', { x: e.clientX, y: e.clientY })
  }

  function onKeyDown(e) {
    notify('key', {
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
    })
  }

  function onHoverEnter() {
    notify('gesture.hoverenter')
  }
  function onHoverLeave() {
    notify('gesture.hoverleave')
  }

  var hovering = false
  function onDocOver(e) {
    if (!hovering && !e.relatedTarget) {
      hovering = true
      onHoverEnter()
    }
  }
  function onDocOut(e) {
    if (hovering && !e.relatedTarget) {
      hovering = false
      onHoverLeave()
    }
  }

  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mouseover', onDocOver)
  document.addEventListener('mouseout', onDocOut)

  window.addEventListener('message', function (e) {
    var d = e.data
    if (!d || d.__desk !== 1 || d.kind !== 'host') return
    if (d.replyTo && pending[d.replyTo]) {
      pending[d.replyTo](d.result)
      delete pending[d.replyTo]
      return
    }
    if (d.event === 'init') {
      ready = true
      if (d.data) {
        if (d.data.theme) document.documentElement.dataset.theme = d.data.theme
        if (d.data.behavior) {
          dragMode = d.data.behavior.dragMode || 'always'
          draggable = d.data.behavior.draggable !== false
        }
        if (d.data.capabilities) buildDesk(d.data.capabilities)
      }
      startMount()
      return
    }
    if (d.event === 'behavior.changed' && d.data) {
      dragMode = d.data.dragMode || dragMode
      draggable = d.data.draggable !== false
      return
    }
    if (d.event === 'capabilities.changed' && d.data) {
      buildDesk(d.data.capabilities || [])
      return
    }
    if (d.event === 'theme.changed' && d.data && d.data.theme) {
      document.documentElement.dataset.theme = d.data.theme
    }
    emit(d.event, d.data)
  })

  window.desk = desk

  function announce() {
    post({ __desk: 1, kind: 'ready' })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce)
  } else {
    announce()
  }
})()
