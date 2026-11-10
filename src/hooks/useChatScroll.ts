import { useCallback, useLayoutEffect, useRef } from 'react';
import useStore from '@store/store';

const saveDelay = 100;
const releaseDelay = 1000;
const settleDelay = 1000;

const isAtBottom = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= 1;

const useChatScroll = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether the view is following the bottom of the chat
  const stuckRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const { chats, currentChatIndex } = useStore.getState();
    const chat = chats?.[currentChatIndex];
    const chatId = chat?.id;

    el.scrollTop =
      typeof chat?.scrollTop === 'number' ? chat.scrollTop : el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    stuckRef.current = isAtBottom(el);

    // The layout can still shift right after mounting (the side menu collapses
    // on small screens). Keep the browser from moving the restored position
    // along with it.
    el.style.overflowAnchor = 'none';
    const settleTimer = setTimeout(() => {
      el.style.overflowAnchor = '';
    }, settleDelay);

    const pin = () => {
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
    };

    const shouldFollow = () =>
      stuckRef.current && useStore.getState().autoScroll;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      saveTimer = undefined;
      const { chats, setChats } = useStore.getState();
      const scrollTop = lastScrollTopRef.current;
      const index = chats?.findIndex((chat) => chat.id === chatId) ?? -1;
      if (!chats || index < 0 || chats[index].scrollTop === scrollTop) return;
      const updatedChats = [...chats];
      updatedChats[index] = { ...chats[index], scrollTop };
      setChats(updatedChats);
    };

    // Judge by direction rather than position: content can grow between our
    // own jump and its scroll event, which would look like having left the bottom.
    let lastClientHeight = el.clientHeight;
    const track = () => {
      const scrollTop = el.scrollTop;
      const lastScrollTop = lastScrollTopRef.current;
      // A view that changes size moves the scroll position on its own
      const resized = el.clientHeight !== lastClientHeight;
      lastClientHeight = el.clientHeight;
      if (scrollTop < lastScrollTop && !isAtBottom(el) && !resized) {
        stuckRef.current = false;
      } else if (scrollTop > lastScrollTop && isAtBottom(el)) {
        stuckRef.current = true;
      }
      lastScrollTopRef.current = scrollTop;
    };

    const handleScroll = () => {
      track();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, saveDelay);
    };

    // An auto-growing textarea collapses for a moment to measure itself, which
    // in some browsers pulls the view up. Undo that before it looks like scrolling.
    const handleInput = (e: Event) => {
      if (content.contains(e.target as Node) && shouldFollow()) pin();
    };

    const follow = () => {
      // The scroll may not have been reported yet
      track();
      if (shouldFollow()) pin();
    };

    // The browser can be scrolling before the page is able to see it, and the
    // next jump would cancel that scroll. So let go at the first sign of the
    // user taking over, and take hold again if nothing ended up moving.
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      track();
      if (!stuckRef.current) return;
      stuckRef.current = false;
      const scrollTop = el.scrollTop;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        if (el.scrollTop !== scrollTop) return;
        stuckRef.current = true;
        follow();
      }, releaseDelay);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && !e.ctrlKey) release();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isUp =
        e.key === 'ArrowUp' ||
        e.key === 'PageUp' ||
        e.key === 'Home' ||
        (e.key === ' ' && e.shiftKey);
      const isTyping =
        e.target instanceof Element &&
        e.target.closest('input, textarea, select, [contenteditable]');
      if (isUp && !isTyping) release();
    };

    let lastScrollHeight = el.scrollHeight;
    const resizeObserver = new ResizeObserver(() => {
      const grew = el.scrollHeight > lastScrollHeight;
      lastScrollHeight = el.scrollHeight;
      follow();
      // Shrinking content can leave the view at the bottom without a scroll
      if (!grew && isAtBottom(el)) stuckRef.current = true;
    });
    resizeObserver.observe(el);
    resizeObserver.observe(content);

    // WebKit can hand the ResizeObserver a stale size while a reply streams in
    // and then logs a loop error. Following DOM changes from an animation frame
    // avoids that.
    let frame = 0;
    const mutationObserver = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        follow();
      });
    });
    mutationObserver.observe(content, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchmove', release, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    // On the document so that it runs after React has handled the event
    document.addEventListener('input', handleInput);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchmove', release);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('input', handleInput);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(releaseTimer);
      clearTimeout(settleTimer);
      if (saveTimer !== undefined) {
        clearTimeout(saveTimer);
        save();
      }
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    lastScrollTopRef.current = el.scrollTop;
    stuckRef.current = isAtBottom(el);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    stuckRef.current = true;
  }, []);

  return { scrollRef, contentRef, scrollToTop, scrollToBottom };
};

export default useChatScroll;
