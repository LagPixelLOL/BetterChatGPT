import React from 'react';
import useStore from '@store/store';

import ChatContent from './ChatContent';
import MobileBar from '../MobileBar';
import StopGeneratingButton from '@components/StopGeneratingButton/StopGeneratingButton';

const Chat = () => {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);
  const currentChatId = useStore((state) => state.chats ? state.chats[state.currentChatIndex].id : null);

  return (
    <div
      className={`flex h-full flex-1 flex-col`}
      style={{ paddingLeft: hideSideMenu ? '0' : `${menuWidth}px` }}
    >
      <MobileBar />
      <main className='relative h-full w-full transition-width flex flex-col overflow-hidden items-stretch flex-1'>
        <ChatContent key={currentChatId} />
        <StopGeneratingButton />
      </main>
    </div>
  );
};

export default Chat;
