import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";

let _client: Awaited<ReturnType<typeof Client.create>> | null = null;

export async function getStorachaClient() {
  if (_client) return _client;

  const pvtKey = process.env.STORACHA_AGENT_PRIVATE_KEY;
  const delegationKey = process.env.STORACHA_AGENT_DELEGATION;

  if (!pvtKey || !delegationKey) {
    throw new Error("STORACHA_AGENT_PRIVATE_KEY and STORACHA_AGENT_DELEGATION required for Storacha operations");
  }

  const principal = Signer.parse(pvtKey);
  const store = new StoreMemory();
  const client = await Client.create({ principal, store });
  const proof = await Proof.parse(delegationKey);
  const space = await client.addSpace(proof);
  await client.setCurrentSpace(space.did());

  _client = client;
  return client;
}
