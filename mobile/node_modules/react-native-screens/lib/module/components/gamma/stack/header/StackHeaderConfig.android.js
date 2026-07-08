function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import React from 'react';
import { Image, StyleSheet } from 'react-native';
import StackHeaderConfigAndroidNativeComponent from '../../../../fabric/gamma/stack/StackHeaderConfigAndroidNativeComponent';
import StackHeaderSubview from './android/StackHeaderSubview.android';
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
  return /*#__PURE__*/React.createElement(StackHeaderConfigAndroidNativeComponent, _extends({
    collapsable: false,
    style: StyleSheet.absoluteFill
  }, baseProps, filteredAndroidProps, backButtonIconProps, scrollFlagProps), backgroundSubview && /*#__PURE__*/React.createElement(StackHeaderSubview, {
    type: "background",
    collapseMode: backgroundSubview.collapseMode
  }, backgroundSubview.Component), leadingSubview && /*#__PURE__*/React.createElement(StackHeaderSubview, {
    type: "leading"
  }, leadingSubview.Component), centerSubview && /*#__PURE__*/React.createElement(StackHeaderSubview, {
    type: "center"
  }, centerSubview.Component), trailingSubview && /*#__PURE__*/React.createElement(StackHeaderSubview, {
    type: "trailing"
  }, trailingSubview.Component));
}
function parseBackButtonIconToNativeProps(icon) {
  if (!icon) {
    return {};
  }
  if (icon.type === 'imageSource') {
    const resolved = Image.resolveAssetSource(icon.imageSource);
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
export default StackHeaderConfig;
//# sourceMappingURL=StackHeaderConfig.android.js.map