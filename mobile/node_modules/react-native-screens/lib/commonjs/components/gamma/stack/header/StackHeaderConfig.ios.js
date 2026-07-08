"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _StackHeaderConfigIOSNativeComponent = _interopRequireDefault(require("../../../../fabric/gamma/stack/StackHeaderConfigIOSNativeComponent"));
var _react = _interopRequireDefault(require("react"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EXPERIMENTAL API, MIGHT CHANGE W/O ANY NOTICE
 */
function StackHeaderConfig(props) {
  // android props are safely dropped
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    android,
    ios,
    ...baseProps
  } = props;
  return /*#__PURE__*/_react.default.createElement(_StackHeaderConfigIOSNativeComponent.default, _extends({
    collapsable: false
  }, baseProps));
}
var _default = exports.default = StackHeaderConfig;
//# sourceMappingURL=StackHeaderConfig.ios.js.map