import React, {
  DetailedHTMLProps,
  HTMLAttributes,
  memo,
  useState,
} from 'react';

import ReactMarkdown from 'react-markdown';
import { CodeProps, ReactMarkdownProps } from 'react-markdown/lib/ast-to-react';

import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import useStore from '@store/store';

import TickIcon from '@icon/TickIcon';
import CrossIcon from '@icon/CrossIcon';
import UpChevronArrow from '@icon/UpChevronArrow';
import DownChevronArrow from '@icon/DownChevronArrow';

import useSubmit from '@hooks/useSubmit';

import {
  ChatInterface,
  MessageInterface,
  ImageContentInterface,
  isImageContent,
  isTextContent,
} from '@type/chat';

import { codeLanguageSubset } from '@constants/chat';

import RefreshButton from './Button/RefreshButton';
import UpButton from './Button/UpButton';
import DownButton from './Button/DownButton';
import CopyButton from './Button/CopyButton';
import EditButton from './Button/EditButton';
import DeleteButton from './Button/DeleteButton';
import MarkdownModeButton from './Button/MarkdownModeButton';

import CodeBlock from '../CodeBlock';
import PopupModal from '@components/PopupModal';
import { preprocessLaTeX } from '@utils/chat';

const MarkdownRenderer = memo(({ text }: { text: string }) => {
  const inlineLatex = useStore((state) => state.inlineLatex);
  const markdownMode = useStore((state) => state.markdownMode);

  return markdownMode ? (
    <ReactMarkdown
      remarkPlugins={[
        remarkGfm,
        [remarkMath, { singleDollarTextMath: inlineLatex }],
      ]}
      rehypePlugins={[
        rehypeKatex,
        [
          rehypeHighlight,
          {
            detect: true,
            ignoreMissing: true,
            subset: codeLanguageSubset,
          },
        ],
      ]}
      linkTarget='_new'
      components={{
        code,
        p,
      }}
    >
      {inlineLatex ? preprocessLaTeX(text) : text}
    </ReactMarkdown>
  ) : (
    <span className='whitespace-pre-wrap'>{text}</span>
  );
});

const ContentView = memo(
  ({
    message,
    setIsEdit,
    messageIndex,
  }: {
    message: MessageInterface;
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    messageIndex: number;
  }) => {
    const { handleSubmit } = useSubmit();

    const [isDelete, setIsDelete] = useState<boolean>(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    const [showReasoning, setShowReasoning] = useState(false);

    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const setChats = useStore((state) => state.setChats);
    const lastMessageIndex = useStore((state) =>
      state.chats ? state.chats[state.currentChatIndex].messages.length - 1 : 0
    );

    const handleDelete = () => {
      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
      updatedChats[currentChatIndex].messages.splice(messageIndex, 1);
      setChats(updatedChats);
    };

    const handleMove = (direction: 'up' | 'down') => {
      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
      const updatedMessages = updatedChats[currentChatIndex].messages;
      const temp = updatedMessages[messageIndex];
      if (direction === 'up') {
        updatedMessages[messageIndex] = updatedMessages[messageIndex - 1];
        updatedMessages[messageIndex - 1] = temp;
      } else {
        updatedMessages[messageIndex] = updatedMessages[messageIndex + 1];
        updatedMessages[messageIndex + 1] = temp;
      }
      setChats(updatedChats);
    };

    const handleRefresh = () => {
      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
      const updatedMessages = updatedChats[currentChatIndex].messages;
      updatedMessages.splice(updatedMessages.length - 1, 1);
      setChats(updatedChats);
      handleSubmit();
    };

    const messageContent = message.content[0];
    const currentTextContent = isTextContent(messageContent) ? messageContent.text : '';

    const currentReasoningContent = message.reasoning_content ? message.reasoning_content : '';
    const showReasoningBox = message.role === 'assistant' && currentReasoningContent;

    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };

    const handleImageClick = (imageUrl: string) => {
      setZoomedImage(imageUrl);
    };

    const handleCloseZoom = () => {
      setZoomedImage(null);
    };

    const validImageContents = Array.isArray(message.content)
      ? (message.content.slice(1).filter(isImageContent) as ImageContentInterface[])
      : [];

    return (
      <>
        {showReasoningBox && (
          <div className='mb-3 border border-gray-300 dark:border-gray-600 rounded overflow-hidden'>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className='btn w-full px-3 py-2 flex justify-between items-center text-left bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
            >
              <span>{showReasoning ? 'Hide Reasoning' : 'Show Reasoning'}</span>
              <span>{showReasoning ? <UpChevronArrow /> : <DownChevronArrow />}</span>
            </button>
            {showReasoning && (
              <div className='p-3 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-600 whitespace-pre-wrap'>
                <MarkdownRenderer text={currentReasoningContent} />
              </div>
            )}
          </div>
        )}

        <div className='markdown prose w-full md:max-w-full break-words dark:prose-invert dark share-gpt-message'>
          <MarkdownRenderer text={currentTextContent} />
        </div>

        {validImageContents.length > 0 && (
          <div className='flex gap-4'>
            {validImageContents.map((image, index) => (
              <div key={index} className='image-container'>
                <img
                  src={image.image_url.url}
                  alt={`uploaded-${index}`}
                  className='h-20 object-contain w-auto cursor-pointer'
                  onClick={() => handleImageClick(image.image_url.url)}
                />
              </div>
            ))}
          </div>
        )}

        {zoomedImage && (
          <PopupModal
            title=''
            setIsModalOpen={handleCloseZoom}
            handleConfirm={handleCloseZoom}
            cancelButton={false}
          >
            <div className='flex justify-center'>
              <img
                src={zoomedImage}
                alt='Zoomed'
                className='max-w-full max-h-full'
              />
            </div>
          </PopupModal>
        )}

        <div className='flex justify-end gap-2 w-full mt-2'>
          {isDelete || (
            <>
              {!useStore.getState().generating &&
                message.role === 'assistant' &&
                messageIndex === lastMessageIndex && (
                  <RefreshButton onClick={handleRefresh} />
                )}
              {messageIndex !== 0 && <UpButton onClick={() => handleMove('up')} />}
              {messageIndex !== lastMessageIndex && (
                <DownButton onClick={() => handleMove('down')} />
              )}

              <MarkdownModeButton />
              <CopyButton onClick={handleCopy} />
              <EditButton setIsEdit={setIsEdit} />
              <DeleteButton setIsDelete={setIsDelete} />
            </>
          )}
          {isDelete && (
            <>
              <button
                className='p-1 hover:text-white'
                aria-label='cancel'
                onClick={() => setIsDelete(false)}
              >
                <CrossIcon />
              </button>
              <button
                className='p-1 hover:text-white'
                aria-label='confirm'
                onClick={handleDelete}
              >
                <TickIcon />
              </button>
            </>
          )}
        </div>
      </>
    );
  }
);

const code = memo((props: CodeProps) => {
  const { inline, className, children } = props;
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return <CodeBlock lang={lang || 'text'} codeChildren={children} />;
  }
});

const p = memo(
  (
    props?: Omit<
      DetailedHTMLProps<
        HTMLAttributes<HTMLParagraphElement>,
        HTMLParagraphElement
      >,
      'ref'
    > &
      ReactMarkdownProps
  ) => {
    return <p className='whitespace-pre-wrap'>{props?.children}</p>;
  }
);

export default ContentView;
