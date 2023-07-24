"use strict";
/**
 * @author Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2017-10-17
 */
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var ava_1 = tslib_1.__importDefault(require("ava"));
var buildSortedURL_1 = tslib_1.__importDefault(require("../buildSortedURL"));
(0, ava_1.default)('build a simple url without params', function (t) {
    var url = '//cross-domain.test/users';
    var params = {};
    var builtUrl = (0, buildSortedURL_1.default)(url, params);
    t.is(builtUrl, "".concat(url));
});
(0, ava_1.default)('build a simple url with params', function (t) {
    var url = '//cross-domain.test/users';
    var params = { name: 'kuitos', age: 18 };
    var builtUrl = (0, buildSortedURL_1.default)(url, params);
    t.is(builtUrl, "".concat(url, "?age=18&name=kuitos"));
});
(0, ava_1.default)('build a url which already had a query string with params', function (t) {
    var url = '//cross-domain.test/users?title=genius';
    var params = { name: 'kuitos', age: 18 };
    var builtUrl = (0, buildSortedURL_1.default)(url, params);
    t.is(builtUrl, '//cross-domain.test/users?age=18&name=kuitos&title=genius');
});
//# sourceMappingURL=test-buildSortedURL.js.map