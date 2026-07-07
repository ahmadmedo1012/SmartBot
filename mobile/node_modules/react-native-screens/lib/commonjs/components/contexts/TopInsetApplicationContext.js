"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TopInsetApplicationContext = void 0;
exports.useTopInsetApplication = useTopInsetApplication;
var React = _interopRequireWildcard(require("react"));
var _flags = require("../../flags");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const TopInsetApplicationContext = exports.TopInsetApplicationContext = /*#__PURE__*/React.createContext(false);
function useTopInsetApplication(headerVisible, disableTopInsetApplication) {
  const alreadyApplied = React.useContext(TopInsetApplicationContext);
  const useLegacyBehavior = _flags.featureFlags.experiment?.androidLegacyTopInsetBehavior ?? false;

  // We want to apply the inset if:
  // - legacy mode (androidLegacyTopInsetBehavior)
  // - or when no ancestor applied it yet and our header is visible
  const wantsToApplyInset = useLegacyBehavior || !alreadyApplied && headerVisible;

  // We apply the padding, only if we want to apply the inset and haven't been told to suppress it
  const appliesTopInset = wantsToApplyInset && !disableTopInsetApplication;

  // Once found header that may apply the padding, mark it as consumed for the subtree
  const nextContextValue = alreadyApplied || wantsToApplyInset;
  return {
    appliesTopInset,
    useLegacyBehavior,
    nextContextValue
  };
}
//# sourceMappingURL=TopInsetApplicationContext.js.map