import React from 'react';
import useStore from '@store/store';

import ChatContent from './ChatContent';
import MobileBar from '../MobileBar';
import StopGeneratingButton from '@components/StopGeneratingButton/StopGeneratingButton';

const Chat = () => {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);
  const currentChatId = useStore((state) => state.chats ? state.chats[state.currentChatIndex].id : null);
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|playbook|silk/i.test(
      navigator.userAgent
    );

  return (
    <div
      className={`flex h-full flex-1 flex-col`}
      style={{
       paddingLeft:
         !isMobile && !hideSideMenu
           ? `${menuWidth}px`
           : '0',
     }}
    >
      <MobileBar />
      <main className='relative h-full w-full overflow-hidden transition-width flex flex-col items-stretch flex-1'>
        <ChatContent key={currentChatId} />
        <StopGeneratingButton />
      </main>
    </div>
  );
};

export default Chat;
