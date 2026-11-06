type RouterLike = {
  canGoBack(): boolean;
  back(): void;
  replace(href: never): void;
};

export function safeBack(router: RouterLike, fallback: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}
