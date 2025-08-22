// functions/src/reliability/ReliabilityFdcProcessor.ts
import axios from "axios";
import { ethers } from "ethers";
import Web3 from "web3";
import {
  prepareAttestationRequestBase,
  submitAttestationRequest,
  retrieveDataAndProofBase,
} from "./Base";
import jsonApiVerificationAbi from "../../abis/jsonApiVerification.json";
import * as dotenv from "dotenv";
dotenv.config();
// Environment variables must be set with `firebase functions:config:set`
const {
  JQ_VERIFIER_URL_TESTNET,
  JQ_VERIFIER_API_KEY_TESTNET,
  COSTON2_DA_LAYER_URL,
  PRIVATE_KEY,
  COSTON2_RPC_URL,
} = process.env;

// Request data
const apiUrl = "https://getcheckinsnapshots-agmir24vzq-uc.a.run.app";
const markProcessedUrl = "https://marksnapshotprocessed-agmir24vzq-uc.a.run.app";
const postprocessJq = '.activities | to_entries | map({ activityId: .key, weatherCode: .value.weatherCode, participants: .value.participants })'

const abiSignature = `{
  "components": [
    {
      "internalType": "string",
      "name": "activityId",
      "type": "string"
    },
    {
      "internalType": "uint256",
      "name": "weatherCode",
      "type": "uint256"
    },
    {
      "internalType": "struct Participant[]",
      "name": "participants",
      "type": "tuple[]",
      "components": [
        { "internalType": "string", "name": "uuid", "type": "string" },
        { "internalType": "bool", "name": "checkedIn", "type": "bool" }
      ]
    }
  ],
  "name": "activities",
  "type": "tuple[]"
}`;

// Configuration constants
const attestationTypeBase = "IJsonApi";
const sourceIdBase = "WEB2";
const verifierUrlBase = JQ_VERIFIER_URL_TESTNET;

import reliabilityBoardAbi from "../../abis/LinkedUpReliabilityBoard.json";
const CONTRACT_ADDRESS = process.env.LINKEDUP_CONTRACT_ADDRESS!;

async function prepareAttestationRequest(
  apiUrl: string,
  postprocessJq: string,
  abiSignature: string
) {
  const requestBody = {
    url: apiUrl,
    postprocessJq: postprocessJq,
    abi_signature: abiSignature,
  };

  // Checkout this site https://jq-verifier-test.flare.rocks/api-doc#/ 
  // to see request body before calling prepareAttestationRequestBase
  const url = `${verifierUrlBase}JsonApi/prepareRequest`;
  const apiKey = JQ_VERIFIER_API_KEY_TESTNET!;

  return await prepareAttestationRequestBase(
    url,
    apiKey,
    attestationTypeBase,
    sourceIdBase,
    requestBody
  );
}

async function retrieveDataAndProof(abiEncodedRequest: string, roundId: number) {
  const url = `${COSTON2_DA_LAYER_URL}api/v1/fdc/proof-by-request-round-raw`;
  return await retrieveDataAndProofBase(url, abiEncodedRequest, roundId);
}

async function interactWithContract(proof: any) {
  if (!PRIVATE_KEY || !COSTON2_RPC_URL) {
    throw new Error("Missing PRIVATE_KEY or COSTON2_RPC_URL in environment");
  }
  console.log("Proof hex:", proof.response_hex, "\n");
  const provider = new ethers.JsonRpcProvider(COSTON2_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const repBoard = new ethers.Contract(
    CONTRACT_ADDRESS,
    reliabilityBoardAbi,
    wallet
  );

  const responseType = (jsonApiVerificationAbi as any).abi[0].inputs[0].components[1];
  console.log("Response type:", responseType, "\n");

  const web3 = new Web3();
  const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
  console.log("Decoded proof:", decodedResponse, "\n");

  const tx = await repBoard.updateReliability({
    merkleProof: proof.proof,
    data: decodedResponse,
  });

  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("Transaction confirmed");

  const allUsers = await repBoard.getAllUsers();
  console.log("All Users with reliability:", allUsers, "\n");
}

async function markSnapshotProcessed(snapshotId: string) {
  try {
    await axios.post(markProcessedUrl, { snapshotId });
    console.log(`Marked snapshot '${snapshotId}' as processed`);
  } catch (err) {
    console.error("Failed to mark snapshot as processed:", err);
  }
}

/**
 * Main job function to be called from Firebase
 */
export async function processReliabilitySnapshot() {
  let snapshotIdToMark: string;

  try {
    const response = await axios.get(apiUrl);
    snapshotIdToMark = response.data.snapshotId;
    if (!snapshotIdToMark) {
      throw new Error("API response did not contain a snapshotId property.");
    }
    else {
      console.log("Snapshot ID found:", snapshotIdToMark);
    }
  } catch (error: any) {
    console.error("Failed to fetch snapshot data:", error.message);
    return;
  }

  const data = await prepareAttestationRequest(apiUrl, postprocessJq, abiSignature);
  if (data.status !== "VALID") {
    console.error("Verifier returned INVALID. Check JQ or ABI formatting.");
    return;
  }

  const abiEncodedRequest = data.abiEncodedRequest;
  const roundId = await submitAttestationRequest(abiEncodedRequest);
  const proof = await retrieveDataAndProof(abiEncodedRequest, roundId);

  await interactWithContract(proof);
  await markSnapshotProcessed(snapshotIdToMark);
}
