import { forwardRef, type ComponentProps } from "react";
import { Platform, type ScrollView } from "react-native";
import { useIsFocused } from "expo-router/react-navigation";
import { KeyboardAwareScrollView, KeyboardToolbar, useKeyboardState } from "react-native-keyboard-controller";

type Props = ComponentProps<typeof KeyboardAwareScrollView>;
/** One keyboard policy for long forms, including multiline and numeric inputs. */
export const FormScrollView = forwardRef<ScrollView, Props>(function FormScrollView(props, ref) {
 const focused = useIsFocused();
 const keyboardVisible = useKeyboardState(state => state.isVisible);
 return <>
  <KeyboardAwareScrollView {...props} ref={instance => { if (typeof ref === "function") return ref(instance); if (ref) ref.current = instance; }}
   style={[{ flex: 1 }, props.style]}
   enabled={focused}
   bottomOffset={62}
   keyboardShouldPersistTaps="handled"
   keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
   automaticallyAdjustKeyboardInsets={false}
  />
  {focused && keyboardVisible ? <KeyboardToolbar /> : null}
 </>;
});
