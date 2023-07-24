export default function isCacheLike(cache) {
    return typeof cache.get === 'function' && typeof cache.set === 'function' && (typeof cache.delete === 'function' || typeof cache.del === 'function');
}
//# sourceMappingURL=isCacheLike.js.map