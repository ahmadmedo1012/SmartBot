"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireDefault(require("react"));
var _reactNative = require("react-native");
var _StackHeaderConfigAndroidNativeComponent = _interopRequireDefault(require("../../../../fabric/gamma/stack/StackHeaderConfigAndroidNativeComponent"));
var _StackHeaderSubview = _interopRequireDefault(require("./android/StackHeaderSubview.android"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EXPERIMENTAL API, MIGHT CHANGE W/O ANY NOTICE
 */
function StackHeaderConfig(props) {
  // ios props are safely dropped
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    android,
    ios,
    ...baseProps
  } = props;
  const {
    backgroundSubview,
    leadingSubview,
    centerSubview,
    trailingSubview,
    backButtonIcon,
    scrollFlagScroll,
    scrollFlagEnterAlways,
    scrollFlagEnterAlwaysCollapsed,
    scrollFlagExitUntilCollapsed,
    scrollFlagSnap,
    ...filteredAndroidProps
  } = android ?? {};
  const backButtonIconProps = parseBackButtonIconToNativeProps(backButtonIcon);
  const scrollFlagProps = resolveScrollFlags(filteredAndroidProps.type, {
    scrollFlagScroll,
    scrollFlagEnterAlways,
    scrollFlagEnterAlwaysCollapsed,
    scrollFlagExitUntilCollapsed,
    scrollFlagSnap
  });
  return /*#__PURE__*/_react.default.createElement(_StackHeaderConfigAndroidNativeComponent.default, _extends({
    collapsable: false,
    style: _reactNative.StyleSheet.absoluteFill
  }, baseProps, filteredAndroidProps, backButtonIconProps, scrollFlagProps), backgroundSubview && /*#__PURE__*/_react.default.createElement(_StackHeaderSubview.default, {
    type: "background",
    collapseMode: backgroundSubview.collapseMode
  }, backgroundSubview.Component), leadingSubview && /*#__PURE__*/_react.default.createElement(_StackHeaderSubview.default, {
    type: "leading"
  }, leadingSubview.Component), centerSubview && /*#__PURE__*/_react.default.createElement(_StackHeaderSubview.default, {
    type: "center"
  }, centerSubview.Component), trailingSubview && /*#__PURE__*/_react.default.createElement(_StackHeaderSubview.default, {
    type: "trailing"
  }, trailingSubview.Component));
}
function parseBackButtonIconToNativeProps(icon) {
  if (!icon) {
    return {};
  }
  if (icon.type === 'imageSource') {
    const resolved = _reactNative.Image.resolveAssetSource(icon.imageSource);
    if (!resolved) {
      console.error('[RNScreens] failed to resolve an asset for back button icon');
    }
    return {
      backButtonImageIconResource: resolved || undefined
    };
  } else if (icon.type === 'drawableResource') {
    return {
      backButtonDrawableIconResourceName: icon.name
    };
  } else {
    throw new Error('[RNScreens] Incorrect icon format for Android. You must provide `imageSource` or `drawableResource`.');
  }
}
const SCROLL_FLAG_DEFAULTS_BY_TYPE = {
  small: {
    scrollFlagScroll: false,
    scrollFlagEnterAlways: false,
    scrollFlagEnterAlwaysCollapsed: false,
    scrollFlagExitUntilCollapsed: false,
    scrollFlagSnap: false
  },
  medium: {
    scrollFlagScroll: true,
    scrollFlagEnterAlways: false,
    scrollFlagEnterAlwaysCollapsed: false,
    scrollFlagExitUntilCollapsed: true,
    scrollFlagSnap: true
  },
  large: {
    scrollFlagScroll: true,
    scrollFlagEnterAlways: false,
    scrollFlagEnterAlwaysCollapsed: false,
    scrollFlagExitUntilCollapsed: true,
    scrollFlagSnap: true
  }
};
function resolveScrollFlags(type, overrides) {
  const defaults = SCROLL_FLAG_DEFAULTS_BY_TYPE[type ?? 'small'];
  return {
    scrollFlagScroll: overrides.scrollFlagScroll ?? defaults.scrollFlagScroll,
    scrollFlagEnterAlways: overrides.scrollFlagEnterAlways ?? defaults.scrollFlagEnterAlways,
    scrollFlagEnterAlwaysCollapsed: overrides.scrollFlagEnterAlwaysCollapsed ?? defaults.scrollFlagEnterAlwaysCollapsed,
    scrollFlagExitUntilCollapsed: overrides.scrollFlagExitUntilCollapsed ?? defaults.scrollFlagExitUntilCollapsed,
    scrollFlagSnap: overrides.scrollFlagSnap ?? defaults.scrollFlagSnap
  };
}
var _default = exports.default = StackHeaderConfig;
//# sourceMappingURL=StackHeaderConfig.android.js.map