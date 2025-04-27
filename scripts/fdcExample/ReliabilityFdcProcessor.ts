// ReliabilityFdcProcessor.ts
// Command to run this script
// npx hardhat run scripts/fdcExample/JsonApi.ts --network coston2
import axios from "axios";
import { run, web3 } from "hardhat";
import { LinkedUpReliabilityBoardInstance } from "../../typechain-types";
import {
  prepareAttestationRequestBase,
  submitAttestationRequest,
  retrieveDataAndProofBase,
} from "./Base";
const LinkedUpReliabilityBoard = artifacts.require("LinkedUpReliabilityBoard");

const {
  JQ_VERIFIER_URL_TESTNET,
  JQ_VERIFIER_API_KEY_TESTNET,
  COSTON2_DA_LAYER_URL,
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

async function retrieveDataAndProof(
  abiEncodedRequest: string,
  roundId: number
) {
  const url = `${COSTON2_DA_LAYER_URL}api/v1/fdc/proof-by-request-round-raw`;
  console.log("Url:", url, "\n");
  return await retrieveDataAndProofBase(url, abiEncodedRequest, roundId);
}

// Only used once to deploy contract manually
async function deployAndVerifyContract() {
  const args: any[] = [];
  const contract: LinkedUpReliabilityBoardInstance = await LinkedUpReliabilityBoard.new(...args);
  try {
    await run("verify:verify", {
      address: contract.address,
      constructorArguments: args,
    });
  } catch (e: any) {
    console.log(e);
  }
  console.log("LinkedUpReliabilityBoard deployed to", contract.address, "\n");
  return contract;
}

async function interactWithContract(
  repBoard: LinkedUpReliabilityBoardInstance,
  proof: any
) {
  console.log("Proof hex:", proof.response_hex, "\n");

  const IJsonApiVerification = await artifacts.require("IJsonApiVerification");
  const responseType = IJsonApiVerification._json.abi[0].inputs[0].components[1];
  console.log("Response type:", responseType, "\n");

  const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
  console.log("Decoded proof:", decodedResponse, "\n");

  const tx = await repBoard.updateReputation({
    merkleProof: proof.proof,
    data: decodedResponse,
  });

  console.log("Transaction:", tx.tx, "\n");

  const allUsers = await repBoard.getAllUsers();
  console.log("All Users with Reputation:", allUsers, "\n");
}

async function markSnapshotProcessed(snapshotId: string) {
  try {
    await axios.post(markProcessedUrl, { snapshotId });
    console.log(`✅ Marked snapshot '${snapshotId}' as processed`);
  } catch (err) {
    console.error("❌ Failed to mark snapshot as processed:", err);
  }
}

async function main() {

  console.log("API URL:", apiUrl);
  console.log("JQ Filter:", postprocessJq);
  console.log("ABI Signature:", abiSignature);

  let snapshotIdToMark: string;
  try {
    console.log(`Fetching snapshot details from ${apiUrl} to get the ID...`);
    const response = await axios.get(apiUrl);

    snapshotIdToMark = response.data.snapshotId;

    if (!snapshotIdToMark) {
      throw new Error("API response did not contain a snapshotId property.");
    }
    console.log(`Found Snapshot ID to process: ${snapshotIdToMark}`);
  } catch (error: any) {
    console.error("Failed to fetch initial snapshot data/ID from API:", error.message);
    process.exit(1);
  }

  // Prepare attestation request using the verifier server 
  // Step 1 & 2 in the User Workflow diagram
  const data = await prepareAttestationRequest(
    apiUrl,
    postprocessJq,
    abiSignature
  );
  console.log("Data:", data, "\n");

  if (data.status !== "VALID") {
    console.error("Verifier returned INVALID. Check JQ or ABI formatting.");
    process.exit(1);
  }

  const abiEncodedRequest = data.abiEncodedRequest;
  // Submit the attestation request to the FDC contract
  // Step 3 in the User Workflow diagram
  const roundId = await submitAttestationRequest(abiEncodedRequest);

  // Retrieve the attested data and proof from the FDC contract
  // Step 6 in the User Workflow diagram
  const proof = await retrieveDataAndProof(abiEncodedRequest, roundId);

  // Deploy a contract that will interact with the JSON data you are attesting
  // const repBoard: LinkedUpReliabilityBoardInstance =
  //   await deployAndVerifyContract();

  // Step 7 in the User Workflow diagram
  // Interact with an already deployed contract
  const repBoard: LinkedUpReliabilityBoardInstance =
    await LinkedUpReliabilityBoard.at("0x79e8066bB6638ADb91A2eCC8b6C7419102FD43a5");

  // Feed the attested data to your deployed contract
  await interactWithContract(repBoard, proof);

  // Finally mark the snapshot as processed
  console.log("Marking Snapshot as Processed via API...");
  await markSnapshotProcessed(snapshotIdToMark);
}

main().then((data) => {
  process.exit(0);
});
