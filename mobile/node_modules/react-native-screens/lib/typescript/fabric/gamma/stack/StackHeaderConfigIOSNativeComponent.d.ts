import type { CodegenTypes as CT, ViewProps } from 'react-native';
export interface NativeProps extends ViewProps {
    title?: string | undefined;
    hidden?: CT.WithDefault<boolean, false>;
    transparent?: CT.WithDefault<boolean, false>;
    backButtonHidden?: CT.WithDefault<boolean, false>;
}
declare const _default: import("react-native").HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=StackHeaderConfigIOSNativeComponent.d.ts.map