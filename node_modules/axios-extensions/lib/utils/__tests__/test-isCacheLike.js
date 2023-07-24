"use strict";
/**
 * Created by Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2018/3/19 下午11:22
 */
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var ava_1 = tslib_1.__importDefault(require("ava"));
var isCacheLike_1 = tslib_1.__importDefault(require("../isCacheLike"));
(0, ava_1.default)('a object with specified method will be regard as cache', function (t) {
    var cache = {};
    t.is((0, isCacheLike_1.default)(cache), false);
    cache = {
        // tslint:disable-next-line
        get: function () {
        },
        // tslint:disable-next-line
        set: function () {
        },
        // tslint:disable-next-line
        del: function () {
        },
    };
    t.is((0, isCacheLike_1.default)(cache), true);
});
//# sourceMappingURL=test-isCacheLike.js.map