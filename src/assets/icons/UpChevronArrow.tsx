import React from 'react';

const UpChevronArrow = ({ className }: { className?: string }) => {
  return (
    <svg
      className={'w-4 h-4' + (className ? ' ' + className : '')}
      aria-hidden='true'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='2'
        d='M5 15l7-7 7 7'
      ></path>
    </svg>
  );
};

export default UpChevronArrow;
