import { Modal, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

/** Native modals have their own window. Measure its insets instead of inheriting
 * the navigator or tab content frame, which can report zero top inset on iOS.
 * Every modal keeps its existing presentation, lifecycle and dismissal props.
 */
export function SafeAreaModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <SafeAreaProvider style={{ flex: 1 }}>{children}</SafeAreaProvider>
    </Modal>
  );
}
