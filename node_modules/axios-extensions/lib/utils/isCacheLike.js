"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isCacheLike(cache) {
    return typeof cache.get === 'function' && typeof cache.set === 'function' && (typeof cache.delete === 'function' || typeof cache.del === 'function');
}
exports.default = isCacheLike;
//# sourceMappingURL=isCacheLike.js.map