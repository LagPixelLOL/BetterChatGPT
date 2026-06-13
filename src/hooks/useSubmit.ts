import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import {
  ChatInterface,
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import { getChatCompletion, getChatCompletionStream } from '@api/api';
import { parseEventSource } from '@api/helper';
import { limitMessageTokens, updateTotalTokenUsed } from '@utils/messageUtils';
import { checkIsResponsesApi } from '@utils/api';
import { officialAPIEndpoint } from '@constants/auth';
import { modelStreamSupport } from '@constants/modelLoader';

import { v4 as uuidv4 } from 'uuid';

// Bumped on every submit; in-flight streams stop once their id is no longer the latest.
let latestGenerationId = 0;

const useSubmit = () => {
  const { t, i18n } = useTranslation('api');
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const apiKey = useStore((state) => state.apiKey);
  const setGenerating = useStore((state) => state.setGenerating);
  const generating = useStore((state) => state.generating);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);

  const cloneChats = () => {
    const chats = useStore.getState().chats;
    return chats ? (structuredClone(chats) as ChatInterface[]) : undefined;
  };

  const isOfficialOAIEndpoint = apiEndpoint === officialAPIEndpoint;
  const isResponsesApi = checkIsResponsesApi(apiEndpoint);

  const generateTitle = async (
    message: MessageInterface[],
    modelConfig: ConfigInterface
  ): Promise<string> => {
    let data;
    try {
      if (!apiKey && isOfficialOAIEndpoint) {
        throw new Error(t('noApiKeyWarning') as string);
      }
      const titleChatConfig = {
        ...modelConfig,
        model: useStore.getState().titleModel ?? modelConfig.model,
      };
      data = await getChatCompletion(
        useStore.getState().apiEndpoint,
        message,
        titleChatConfig,
        apiKey ? apiKey : undefined,
        undefined,
        useStore.getState().apiVersion,
      );
    } catch (error: unknown) {
      throw new Error(
        `${t('errors.errorGeneratingTitle')}\n${(error as Error).message}`
      );
    }
    if (isResponsesApi) {
      let output = data?.output;
      if (!Array.isArray(output)) {
        return '';
      }
      return output.reduce((prev, curr) => {
        if (curr?.type !== 'message') return prev;
        const messageText = curr?.content?.[0]?.text ?? '';
        return prev + messageText;
      }, '');
    } else {
      return data?.choices?.[0]?.message?.content ?? '';
    }
  };

  const handleSubmit = async () => {
    const chats = useStore.getState().chats;
    if (generating || !chats) return;

    const generationId = ++latestGenerationId;
    const assistantMessageId = uuidv4();

    const updatedChats: ChatInterface[] = structuredClone(chats);

    updatedChats[currentChatIndex].messages.push({
      id: assistantMessageId,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '',
        } as TextContentInterface,
      ],
    });

    setChats(updatedChats);
    setGenerating(true);

    try {
      const isStreamSupported =
        modelStreamSupport[chats[currentChatIndex].config.model];
        const { model, temperature, max_tokens } = chats[currentChatIndex].config;
        const supportsStream = modelStreamSupport[model];
        console.log('[useSubmit] Model streaming support:', {
          model,
          supportsStream,
          isStreamSupported
        });
      let data;
      let stream;
      if (chats[currentChatIndex].messages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      const messages = limitMessageTokens(
        chats[currentChatIndex].messages,
        chats[currentChatIndex].config.max_tokens,
        chats[currentChatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      if (!apiKey && isOfficialOAIEndpoint) {
        throw new Error(t('noApiKeyWarning') as string);
      }

      let finishReason: string | undefined;
      if (!isStreamSupported) {
        data = await getChatCompletion(
          useStore.getState().apiEndpoint,
          messages,
          chats[currentChatIndex].config,
          apiKey ? apiKey : undefined,
          undefined,
          useStore.getState().apiVersion
        );

        let reasoningContent: string;
        let messageContent: string;
        if (isResponsesApi) {
          const output = data?.output;
          if (!Array.isArray(output)) {
            throw new Error(t('errors.failedToRetrieveData') as string + '\n\nData: ' + JSON.stringify(data));
          }

          finishReason = data?.incomplete_details?.reason ?? data.status;

          ({ reasoningContent, messageContent } = output.reduce((prev, curr) => {
            if (!curr?.type) return prev;
            switch (curr.type) {
              case 'reasoning':
                prev.reasoningContent += curr?.summary?.[0]?.text ?? '';
                break;
              case 'message':
                prev.messageContent += curr?.content?.[0]?.text ?? '';
            }
            return prev;
          }, { reasoningContent: '', messageContent: '' }));
        } else {
          const choice = data?.choices?.[0];
          if (!choice) {
            throw new Error(t('errors.failedToRetrieveData') as string + '\n\nData: ' + JSON.stringify(data));
          }

          finishReason = choice.finish_reason;
          if (!finishReason || finishReason === 'stop' || finishReason === 'content_filter') {
            const nativeFinishReason = choice?.native_finish_reason;
            if (typeof nativeFinishReason === 'string') {
              finishReason = nativeFinishReason.toLowerCase();
            }
          }

          const messageObj = choice.message;
          reasoningContent = messageObj?.reasoning_content ?? messageObj?.reasoning ?? '';
          messageContent = messageObj.content;
        }

        const updatedChats: ChatInterface[] = structuredClone(useStore.getState().chats as ChatInterface[]);
        const updatedMessages = updatedChats[currentChatIndex]?.messages;
        const updatedMessage = updatedMessages?.find(
          (m) => m.id === assistantMessageId
        );
        if (updatedMessage && generationId === latestGenerationId) {
          updatedMessage.reasoning_content = reasoningContent;
          (updatedMessage.content[0] as TextContentInterface).text = messageContent;
          setChats(updatedChats);
        }
      } else {
        stream = await getChatCompletionStream(
          useStore.getState().apiEndpoint,
          messages,
          chats[currentChatIndex].config,
          apiKey ? apiKey : undefined,
          undefined,
          useStore.getState().apiVersion
        );

        if (stream) {
          if (stream.locked)
            throw new Error(t('errors.streamLocked') as string);
          const reader = stream.getReader();
          let reading = true;
          let partial = '';
          while (reading && useStore.getState().generating && generationId === latestGenerationId) {
            const { done, value } = await reader.read();
            const result = parseEventSource(
              partial + new TextDecoder().decode(value)
            );
            partial = '';

            if (result === '[DONE]' || done) {
              reading = false;
            } else {
              const { reasoningContent, messageContent } = result.reduce((prev, curr) => {
                if (typeof curr === 'string') {
                  partial += curr;
                } else {
                  try {
                    if (isResponsesApi) {
                      const currResp: any = curr;
                      switch (currResp?.type) {
                        case 'response.reasoning_summary_text.delta':
                          prev.reasoningContent += currResp.delta;
                          break;
                        case 'response.output_text.delta':
                          prev.messageContent += currResp.delta;
                          break;
                        case 'response.incomplete':
                          finishReason = currResp.response.incomplete_details?.reason ?? currResp.response.status;
                      }
                    } else {
                      const choice = curr?.choices?.[0];
                      const delta = choice?.delta;
                      if (!delta) {
                        // cover the case where we get some element which doesnt have text data, e.g. usage stats
                        return prev;
                      }
                      const reasoningContent = delta.reasoning_content ?? delta.reasoning;
                      if (reasoningContent) prev.reasoningContent += reasoningContent;
                      const messageContent = delta.content;
                      if (messageContent) prev.messageContent += messageContent;

                      if (!finishReason) {
                        finishReason = choice.finish_reason;
                        if (!finishReason || finishReason === 'stop' || finishReason === 'content_filter') {
                          const nativeFinishReason = choice?.native_finish_reason;
                          if (typeof nativeFinishReason === 'string') {
                            finishReason = nativeFinishReason.toLowerCase();
                          }
                        }
                      }
                    }
                  } catch (e: unknown) {
                    throw new Error(t('errors.failedToRetrieveData') as string + '\n\nMessage: ' + (e as Error).message + '\n\nData: ' + JSON.stringify(curr));
                  }
                }
                return prev;
              }, { reasoningContent: '', messageContent: '' });

              const updatedChats = cloneChats();
              if (!updatedChats) return;
              const updatedMessages = updatedChats[currentChatIndex]?.messages;
              const updatedMessage = updatedMessages?.find(
                (m) => m.id === assistantMessageId
              );
              if (!updatedMessage) {
                reading = false;
                break;
              }
              if (updatedMessage.reasoning_content) {
                updatedMessage.reasoning_content += reasoningContent;
              } else {
                updatedMessage.reasoning_content = reasoningContent;
              }
              (updatedMessage.content[0] as TextContentInterface).text += messageContent;
              setChats(updatedChats);
            }
          }
          if (useStore.getState().generating) {
            reader.cancel(t('errors.cancelledByUser') as string);
          } else {
            reader.cancel(t('errors.generationCompleted') as string);
          }
          reader.releaseLock();
          stream.cancel();
        }
      }

      // A newer submit has superseded this one; don't finalize or touch shared state.
      if (generationId !== latestGenerationId) return;

      // update tokens used in chatting
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;

      if (currChats && countTotalTokens) {
        const model = currChats[currentChatIndex].config.model;
        const messages = currChats[currentChatIndex].messages;
        updateTotalTokenUsed(
          model,
          messages.slice(0, -1),
          messages[messages.length - 1]
        );
      }

      if (finishReason && finishReason !== 'stop' && finishReason !== 'completed' && finishReason !== 'end_turn') {
        throw new Error('Finish reason is not "stop".\n\nFinish reason: ' + finishReason);
      }

      // generate title for new chats
      if (
        useStore.getState().autoTitle &&
        currChats &&
        !currChats[currentChatIndex]?.titleSet
      ) {
        const messages_length = currChats[currentChatIndex].messages.length;
        const assistant_message =
          currChats[currentChatIndex].messages[messages_length - 1].content;
        const user_message =
          currChats[currentChatIndex].messages[messages_length - 2].content;

        const message: MessageInterface = {
          id: uuidv4(),
          role: 'user',
          content: [
            ...user_message,
            ...assistant_message,
            {
              type: 'text',
              text: `Generate a title in less than 6 words for the conversation so far (language: ${i18n.language})`,
            } as TextContentInterface,
          ],
        };

        const updatedChats = cloneChats();
        if (!updatedChats) return;
        let title = (
          await generateTitle([message], updatedChats[currentChatIndex].config)
        ).trim();
        if (title.startsWith('"') && title.endsWith('"')) {
          title = title.slice(1, -1);
        }
        updatedChats[currentChatIndex].title = title;
        updatedChats[currentChatIndex].titleSet = true;
        setChats(updatedChats);

        // update tokens used for generating title
        if (countTotalTokens) {
          const model = updatedChats[currentChatIndex].config.model;
          updateTotalTokenUsed(model, [message], {
            id: uuidv4(),
            role: 'assistant',
            content: [{ type: 'text', text: title } as TextContentInterface],
          });
        }
      }
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      if (generationId === latestGenerationId) setError(err);
    }
    if (generationId === latestGenerationId) setGenerating(false);
  };

  return { handleSubmit, error };
};

export default useSubmit;
