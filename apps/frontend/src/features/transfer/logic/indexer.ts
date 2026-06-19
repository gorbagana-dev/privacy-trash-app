import { createIndexer } from "@gorbagana/privacy-trash-client/browser";

import { env } from "@/config/env";

export const privacyIndexer = createIndexer({
  baseUrl: env.privacyTrashApiUrl,
});
