export {
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
  errorOptions,
  type ProtocolOpenAIErrorOptions,
} from "./errors.js";

export {
  mapProviderRequestToOpenAI,
  type MapRequestOptions,
  type OpenAIChatCompletionBody,
} from "./mapping/request.js";

export {
  mapOpenAIResponseToProvider,
  type MapResponseOptions,
} from "./mapping/response.js";

export {
  OpenAIStreamMapper,
  type MapStreamOptions,
} from "./mapping/stream.js";

export {
  OpenAICompatibleProtocol,
  createOpenAICompatibleClient,
  type OpenAIChatCompletionsClient,
  type OpenAICompatibleProtocolOptions,
  type CreateOpenAIClientOptions,
} from "./protocol.js";
