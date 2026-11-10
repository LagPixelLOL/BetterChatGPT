import React from 'react';
import UpArrow from '@icon/UpArrow';

const ScrollToTopButton = React.memo(({ onClick }: { onClick: () => void }) => {
  return (
    <button
      className={`cursor-pointer absolute left-6 bottom-16 z-10 rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200`}
      aria-label='scroll to top'
      onClick={onClick}
    >
      <UpArrow />
    </button>
  );
});

export default ScrollToTopButton;
