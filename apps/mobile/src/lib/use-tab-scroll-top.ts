import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useFocusEffect } from "expo-router";
import { Keyboard, type FlatList, type ScrollView } from "react-native";
import { subscribeTabPress, tabPressVersion, type PrimaryTab } from "./tab-events";
export function useTabScrollTop<T>(tab: PrimaryTab, ref: RefObject<ScrollView | FlatList<T> | null>, enabled = true) {
  const handled = useRef(0), frame = useRef<number | null>(null);
  const scroll = useCallback(() => {
    Keyboard.dismiss();
    const move = () => {
      const view = ref.current;
      if (view && "scrollToOffset" in view) view.scrollToOffset({ offset: 0, animated: false });
      else view?.scrollTo({ y: 0, animated: false });
    };
    move();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { move(); frame.current = null; });
  }, [ref]);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeTabPress(tab, scroll);
    return () => { unsubscribe(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [tab, scroll, enabled]);
  useFocusEffect(useCallback(() => {
    if (!enabled || handled.current === tabPressVersion(tab)) return;
    handled.current = tabPressVersion(tab);
    scroll();
  }, [tab, scroll, enabled]));
}
