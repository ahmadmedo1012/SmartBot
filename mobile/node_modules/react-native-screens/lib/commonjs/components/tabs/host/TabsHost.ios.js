"use strict";
'use client';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _TabsHostIOSNativeComponent = _interopRequireDefault(require("../../../fabric/tabs/TabsHostIOSNativeComponent"));
var _private = require("../../../private");
var _TabsBottomAccessory = _interopRequireDefault(require("../bottom-accessory/TabsBottomAccessory"));
var _TabsBottomAccessoryContent = _interopRequireDefault(require("../bottom-accessory/TabsBottomAccessoryContent"));
var _PlatformUtils = require("../../helpers/PlatformUtils");
var _useTabsHost = require("./useTabsHost");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EXPERIMENTAL API, MIGHT CHANGE W/O ANY NOTICE
 */
function TabsHost(props) {
  _private.RNSLog.log(`TabsHost render`);

  // android props are safely dropped
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    ios,
    android,
    ...baseProps
  } = props;
  const {
    children,
    direction,
    nativeContainerStyle,
    onTabSelected,
    navStateRequest,
    ...filteredBaseProps
  } = baseProps;
  const componentNodeRef = _react.default.useRef(null);
  const {
    onTabSelected: onTabSelectedCallback
  } = (0, _useTabsHost.useTabsHost)({
    componentNodeRef,
    onTabSelected
  });
  const [bottomAccessoryEnvironment, setBottomAccessoryEnvironment] = (0, _react.useState)('regular');
  return /*#__PURE__*/_react.default.createElement(_TabsHostIOSNativeComponent.default, _extends({
    style: styles.fillParent,
    navStateRequest: navStateRequest,
    onTabSelected: onTabSelectedCallback,
    nativeContainerBackgroundColor: nativeContainerStyle?.backgroundColor
    // @ts-ignore suppress ref - debug only
    ,
    ref: componentNodeRef
  }, filteredBaseProps, {
    // iOS-specific
    layoutDirection: direction,
    tabBarControllerMode: ios?.tabBarControllerMode,
    tabBarMinimizeBehavior: ios?.tabBarMinimizeBehavior,
    tabBarTintColor: ios?.tabBarTintColor,
    onMoreTabSelected: ios?.onMoreTabSelected
  }), children, ios?.bottomAccessory && _PlatformUtils.isIOS26OrHigher && (_reactNative.Platform.constants.reactNativeVersion.minor >= 82 ? /*#__PURE__*/_react.default.createElement(_TabsBottomAccessory.default, null, /*#__PURE__*/_react.default.createElement(_TabsBottomAccessoryContent.default, {
    environment: "regular"
  }, ios.bottomAccessory('regular')), /*#__PURE__*/_react.default.createElement(_TabsBottomAccessoryContent.default, {
    environment: "inline"
  }, ios.bottomAccessory('inline'))) : /*#__PURE__*/_react.default.createElement(_TabsBottomAccessory.default, {
    onEnvironmentChange: event => {
      setBottomAccessoryEnvironment(event.nativeEvent.environment);
    }
  }, ios.bottomAccessory(bottomAccessoryEnvironment))));
}
var _default = exports.default = TabsHost;
const styles = _reactNative.StyleSheet.create({
  fillParent: {
    flex: 1,
    width: '100%',
    height: '100%'
  }
});
//# sourceMappingURL=TabsHost.ios.js.map