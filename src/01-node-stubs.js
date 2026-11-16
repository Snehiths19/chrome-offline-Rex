// == SECTION 1: NODE STUBS ==
// Minimal browser-API stubs so the game files can run under Node (src/files.js
// loadGame, used by tests/harness.js) without a DOM. Real browsers skip this block.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    innerWidth: 600,
    devicePixelRatio: 1,
  };
  const nodeStubs = {};
  function stubNode() {
    return {
      _listeners: {},
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      setAttribute() {},
      dataset: {},
      textContent: '',
    };
  }
  global.document = {
    getElementById: (id) => {
      if (id === 'gameCanvas') {
        if (!nodeStubs.gameCanvas) {
          nodeStubs.gameCanvas = {
            width: 600,
            height: 200,
            style: {},
            getContext: () => ({
              drawImage: () => {},
              clearRect: () => {},
              fillRect: () => {},
              fillText: () => {},
              arc: () => {},
              beginPath: () => {},
              closePath: () => {},
              fill: () => {},
              stroke: () => {},
              moveTo: () => {},
              lineTo: () => {},
              measureText: () => ({ width: 0 }),
              save: () => {},
              restore: () => {},
              translate: () => {},
              scale: () => {},
              rotate: () => {},
              setTransform: () => {},
              ellipse: () => {},
              fillStyle: '',
              strokeStyle: '',
              font: '',
              textAlign: '',
              globalAlpha: 1,
            }),
            addEventListener: () => {},
          };
        }
        return nodeStubs.gameCanvas;
      }
      if (!nodeStubs[id]) nodeStubs[id] = stubNode();
      return nodeStubs[id];
    },
    addEventListener: () => {},
  };
  global.Image = class {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.src = '';
      this.width = 1;
      this.height = 1;
      this.complete = true;
    }
  };
  global.requestAnimationFrame = (cb) => {
    const id = setImmediate(() => cb(Date.now()));
    id.unref(); // don't keep Node alive after tests complete
    return id;
  };
  global.cancelAnimationFrame = (id) => clearImmediate(id);
  global.localStorage = {
    _store: {},
    getItem(k) {
      return this._store[k] !== undefined ? this._store[k] : null;
    },
    setItem(k, v) {
      this._store[k] = String(v);
    },
    removeItem(k) {
      delete this._store[k];
    },
  };
  window.document = global.document;
}
