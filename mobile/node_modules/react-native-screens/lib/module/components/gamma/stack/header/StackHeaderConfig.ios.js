function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import StackHeaderConfigIOSNativeComponent from '../../../../fabric/gamma/stack/StackHeaderConfigIOSNativeComponent';
import React from 'react';

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
  return /*#__PURE__*/React.createElement(StackHeaderConfigIOSNativeComponent, _extends({
    collapsable: false
  }, baseProps));
}
export default StackHeaderConfig;
//# sourceMappingURL=StackHeaderConfig.ios.js.map