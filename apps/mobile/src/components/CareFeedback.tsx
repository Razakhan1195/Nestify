import { useEffect, useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { careNotice, clearCareNotice } from "@/lib/screen-state";
import { ActionFeedback } from "./ActionFeedback";

export function CareFeedback() {
  const notice = useSyncExternalStore(careNotice.subscribe, careNotice.getSnapshot);
  const router = useRouter(), focused = useIsFocused();
  useEffect(() => {
    if (!notice || !focused) return;
    AccessibilityInfo.announceForAccessibility(notice.message);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
      if (active && !enabled) timer = setTimeout(() => clearCareNotice(notice.id), notice.concernTaskId ? 8000 : 5000);
    }).catch(() => {});
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [notice, focused]);
  if (!notice || !focused) return null;
  return <ActionFeedback message={notice.message} onClose={() => clearCareNotice(notice.id)}
    actionLabel={notice.concernTaskId ? "View completed task" : undefined}
    onAction={notice.concernTaskId ? () => { clearCareNotice(notice.id); router.push({pathname:"/care/[id]",params:{id:notice.concernTaskId!}}); } : undefined}/>;
}
