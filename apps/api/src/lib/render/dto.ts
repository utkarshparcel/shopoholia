import { REVEAL_UNLOCK_COST_COINS } from "@worn/shared";
import type { RenderRecord } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";

export async function renderCardDto(render: RenderRecord, storage: StorageClient) {
  const canShowImage = render.unlocked && render.status === "DONE" && render.imageKey;
  return {
    id: render.id,
    orderItemId: render.orderItemId,
    scenario: render.scenario,
    imageUrl: canShowImage ? await storage.getSignedUrl(render.imageKey!) : null,
    isFree: render.isFree,
    unlocked: render.unlocked,
    status: render.status,
    unlockCostCoins:
      !render.isFree && !render.unlocked ? REVEAL_UNLOCK_COST_COINS : undefined,
  };
}
