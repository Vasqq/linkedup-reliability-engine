// functions/src/reliability/Base.ts

// External dependencies
import { ethers } from "ethers";
import fetch from "node-fetch";

// Load environment variables (injected via dotenv locally or Firebase config in cloud)
import * as dotenv from "dotenv";
dotenv.config();

/*
 * abis for Flare contracts that this base module depends on.
 * These must be exported from your Hardhat artifacts and trimmed down to ABI-only JSON.
 * Place them in functions/abis/
 */
import helpersAbi from "../../abis/Helpers.json";
import fdcHubAbi from "../../abis/FdcHub.json";
import fdcFeeConfigAbi from "../../abis/FdcRequestFeeConfigurations.json";
import flareSystemsManagerAbi from "../../abis/FlareSystemsManager.json";
import relayAbi from "../../abis/Relay.json";

// Environment variables
const { COSTON2_RPC_URL, PRIVATE_KEY } = process.env;
if (!COSTON2_RPC_URL || !PRIVATE_KEY) {
  throw new Error("Missing COSTON2_RPC_URL or PRIVATE_KEY in environment");
}

// Provider and signer
const provider = new ethers.JsonRpcProvider(COSTON2_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

/*
 * Converts a string to hex with zero-padding.
 */
function toHex(data: string) {
  let result = "";
  for (let i = 0; i < data.length; i++) {
    result += data.charCodeAt(i).toString(16);
  }
  return result.padEnd(64, "0");
}

/*
 * Converts a UTF-8 string to a hex string with 0x prefix.
 */
function toUtf8HexString(data: string) {
  return "0x" + toHex(data);
}

/*
 * Sleep helper.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * Connects to the FdcHub contract using its address from Helpers.
 */
async function getFdcHub() {
  // const helpers = await getHelpers();
  const fdcHubAddress: string = "0x48aC463d7975828989331F4De43341627b9c5f1D";
  return new ethers.Contract(fdcHubAddress, fdcHubAbi, wallet);
}

/*
 * Connects to the FlareSystemsManager contract using its address from Helpers.
 */
async function getFlareSystemsManager() {
  // const helpers = await getHelpers();
  // const addr: string = await helpers.getFlareSystemsManager();
  const addr: string = "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52";
  return new ethers.Contract(addr, flareSystemsManagerAbi, wallet);
}

/*
 * Gets the request fee for a given ABI-encoded request.
 */
async function getFdcRequestFee(abiEncodedRequest: string) {
  // const helpers = await getHelpers();
  // const addr: string = await helpers.getFdcRequestFeeConfigurations();
  const addr: string = "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e"
  const contract = new ethers.Contract(addr, fdcFeeConfigAbi, wallet);
  return await contract.getRequestFee(abiEncodedRequest);
}

async function getRelay() {
  // const helpers: HelpersInstance = await getHelpers();
  // const relayAddress: string = await helpers.getRelay();
  const relayAddress: string = "0x97702e350CaEda540935d92aAf213307e9069784";
  return new ethers.Contract(relayAddress, relayAbi, wallet);
}

/*
 * Prepares an attestation request by POSTing to the verifier API.
 */
async function prepareAttestationRequestBase(
  url: string,
  apiKey: string,
  attestationTypeBase: string,
  sourceIdBase: string,
  requestBody: any
) {
  console.log("Url:", url, "\n");
  const attestationType = toUtf8HexString(attestationTypeBase);
  const sourceId = toUtf8HexString(sourceIdBase);

  const request = {
    attestationType,
    sourceId,
    requestBody,
  };
  console.log("Prepared request:\n", request, "\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (response.status !== 200) {
    throw new Error(
      `Response status is not OK: ${response.status} ${response.statusText}\n`
    );
  }
  console.log("Response status is OK\n");

  return await response.json();
}

/*
 * Calculates the FDC round ID given a submitted transaction.
 */
async function calculateRoundId(tx: ethers.TransactionResponse) {
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Transaction receipt missing");
  }
  const block = await provider.getBlock(receipt.blockNumber);
  const blockTimestamp = BigInt(block!.timestamp);

  const flareSystemsManager = await getFlareSystemsManager();
  const firstVotingRoundStartTs = BigInt(
    await flareSystemsManager.firstVotingRoundStartTs()
  );
  const votingEpochDurationSeconds = BigInt(
    await flareSystemsManager.votingEpochDurationSeconds()
  );

  console.log("Block timestamp:", blockTimestamp, "\n");
  console.log("First voting round start ts:", firstVotingRoundStartTs, "\n");
  console.log("Voting epoch duration seconds:", votingEpochDurationSeconds, "\n");

  const roundId = Number(
    (blockTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds
  );
  console.log("Calculated round id:", roundId, "\n");
  console.log(
    "Received round id:",
    Number(await flareSystemsManager.getCurrentVotingEpochId()),
    "\n"
  );
  return roundId;
}

/*
 * Submits an attestation request to FdcHub.
 */
async function submitAttestationRequest(abiEncodedRequest: string) {
  const fdcHub = await getFdcHub();
  const requestFee = await getFdcRequestFee(abiEncodedRequest);

  const tx = await fdcHub.requestAttestation(abiEncodedRequest, {
    value: requestFee,
  });
  console.log("Submitted request:", tx.hash, "\n");

  const roundId = await calculateRoundId(tx);
  console.log(
    `Check round progress at: https://coston2-systems-explorer.flare.rocks/voting-epoch/${roundId}?tab=fdc\n`
  );
  return roundId;
}

/*
 * Helper for posting to the DA Layer and polling until proof is ready.
 */
async function postRequestToDALayer(
  url: string,
  request: any,
  watchStatus = false
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (watchStatus && response.status !== 200) {
    throw new Error(
      `Response status is not OK: ${response.status} ${response.statusText}\n`
    );
  } else if (watchStatus) {
    console.log("Response status is OK\n");
  }
  return await response.json();
}

/*
 * Retrieves data + proof from the DA Layer, retrying until proof is finalized.
 */
async function retrieveDataAndProofBase(
  url: string,
  abiEncodedRequest: string,
  roundId: number
) {
  console.log("Waiting for the round to finalize...");
  const relay = await getRelay();
  while (!(await relay.isFinalized(200, roundId))) {
    await sleep(30000);
  }
  console.log("Round finalized!\n");

  const request = { votingRoundId: roundId, requestBytes: abiEncodedRequest };
  console.log("Prepared request:\n", request, "\n");

  await sleep(10000);
  let proof = await postRequestToDALayer(url, request, true);
  console.log("Waiting for the DA Layer to generate the proof...");
  while (!proof.response_hex) {
    await sleep(10000);
    proof = await postRequestToDALayer(url, request, false);
  }
  console.log("Proof generated!\n");

  console.log("Proof:", proof, "\n");
  return proof;
}

// Exported API
export {
  toUtf8HexString,
  sleep,
  prepareAttestationRequestBase,
  submitAttestationRequest,
  retrieveDataAndProofBase,
  getFdcHub,
  getFdcRequestFee,
  getRelay,
  calculateRoundId,
  postRequestToDALayer,
};
