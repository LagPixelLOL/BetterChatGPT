import { ModelCost } from '@type/chat';
import useStore from '@store/store';
import i18next from 'i18next';

interface ModelData {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: any;
  // TODO: Remove workaround once openrouter supports it;
  is_stream_supported: boolean; // custom field until better workaround or openrouter proper support
}

interface ModelsJson {
  data: ModelData[];
}

const modelsJsonUrl = 'models.json';

export const loadModels = async (): Promise<{
  modelOptions: string[];
  modelMaxToken: { [key: string]: number };
  modelCost: ModelCost;
  modelTypes: { [key: string]: string };
  modelStreamSupport: { [key: string]: boolean };
  modelDisplayNames: { [key: string]: string };
}> => {
  const response = await fetch(modelsJsonUrl);
  const modelsJson: ModelsJson = await response.json();

  const modelOptions: string[] = [];
  const modelMaxToken: { [key: string]: number } = {};
  const modelCost: ModelCost = {};
  const modelTypes: { [key: string]: string } = {};
  const modelStreamSupport: { [key: string]: boolean } = {};
  const modelDisplayNames: { [key: string]: string } = {};

  // Add custom models first
  const customModels = useStore.getState().customModels;
  customModels.forEach((model) => {
    const modelId = model.id;
    modelOptions.push(modelId);
    modelMaxToken[modelId] = model.context_length;
    modelCost[modelId] = {
      prompt: { price: parseFloat(model.pricing.prompt), unit: 1 },
      completion: { price: parseFloat(model.pricing.completion), unit: 1 },
      image: { price: parseFloat(model.pricing.image), unit: 1 },
    };

    modelTypes[modelId] = model.architecture.modality.includes('image') ? 'image' : 'text';
    modelStreamSupport[modelId] = model.is_stream_supported;
    console.log("init model:", model.name);
    console.log("init model with stream support:", model.is_stream_supported);
    modelDisplayNames[modelId] = `${model.name} ${i18next.t('customModels.customLabel', { ns: 'model' })}`;
  });

  const processModelWithId = (model: any, modelId: string) => {
    modelOptions.push(modelId);
    modelMaxToken[modelId] = model.context_length;
    modelCost[modelId] = {
      prompt: { price: parseFloat(model.pricing.prompt), unit: 1 },
      completion: { price: parseFloat(model.pricing.completion), unit: 1 },
      image: { price: 0, unit: 1 }, // default for no image models
    };

    // TODO: Remove workaround once openrouter supports it
    if (modelId.includes('o1-')) {
      model.is_stream_supported = false;
    } else {
      model.is_stream_supported = true;
    }

    // Detect image capabilities
    var inputModality = model.architecture.modality.split('->');

    if (parseFloat(model.pricing.image) > 0 || (inputModality && inputModality.length >= 1 && inputModality[0].includes('image'))) {
      modelTypes[modelId] = 'image';
      modelCost[modelId].image = {
        price: parseFloat(model.pricing.image),
        unit: 1,
      };
    } else {
      modelTypes[modelId] = 'text';
    }
    modelStreamSupport[modelId] = model.is_stream_supported;
    modelDisplayNames[modelId] = modelId;
  };

  modelsJson.data.forEach((model) => {processModelWithId(model, model.id);});

  return {
    modelOptions,
    modelMaxToken,
    modelCost,
    modelTypes,
    modelStreamSupport,
    modelDisplayNames,
  };
};

export type ModelOptions = string;
