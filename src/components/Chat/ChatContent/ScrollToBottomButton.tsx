import React from 'react';
import { useScrollToBottom } from 'react-scroll-to-bottom';
import DownArrow from '@icon/DownArrow';

const ScrollToBottomButton = React.memo(() => {
  const scrollToBottom = useScrollToBottom();

  const handleClick = () => {
    // @ts-ignore
    scrollToBottom({ behavior: 'auto' });
  };

  return (
    <button
      className={`cursor-pointer absolute left-6 bottom-6 z-10 rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200`}
      aria-label='scroll to bottom'
      onClick={handleClick}
    >
      <DownArrow />
    </button>
  );
});

export default ScrollToBottomButton;
