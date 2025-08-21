import helpersAbi from "../../abis/Helpers.json";
import fdcHubAbi from "../../abis/FdcHub.json";
import fdcFeeConfigAbi from "../../abis/FdcRequestFeeConfigurations.json";
import flareSystemsManagerAbi from "../../abis/FlareSystemsManager.json";
import relayAbi from "../../abis/Relay.json";
function toHex(data: string) {
  var result = "";
  for (var i = 0; i < data.length; i++) {
    result += data.charCodeAt(i).toString(16);
  }
  return result.padEnd(64, "0");
}

function toUtf8HexString(data: string) {
  return "0x" + toHex(data);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFdcHub() {
  const helpers: HelpersInstance = await getHelpers();
  const fdcHubAddress: string = await helpers.getFdcHub();
  return await FdcHub.at(fdcHubAddress);
}

async function getFlareSystemsManager() {
  const helpers: HelpersInstance = await getHelpers();
  const flareSystemsManagerAddress: string =
    await helpers.getFlareSystemsManager();
  return await FlareSystemsManager.at(flareSystemsManagerAddress);
}

async function getFdcRequestFee(abiEncodedRequest: string) {
  const helpers: HelpersInstance = await getHelpers();
  const fdcRequestFeeConfigurationsAddress: string =
    await helpers.getFdcRequestFeeConfigurations();
  const fdcRequestFeeConfigurations: IFdcRequestFeeConfigurationsInstance =
    await FdcRequestFeeConfigurations.at(fdcRequestFeeConfigurationsAddress);
  return await fdcRequestFeeConfigurations.getRequestFee(abiEncodedRequest);
}

async function getRelay() {
  const helpers: HelpersInstance = await getHelpers();
  const relayAddress: string = await helpers.getRelay();
  return await IRelay.at(relayAddress);
}

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
    attestationType: attestationType,
    sourceId: sourceId,
    requestBody: requestBody,
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
  if (response.status != 200) {
    throw new Error(
      `Response status is not OK, status ${response.status} ${response.statusText}\n`
    );
  }
  console.log("Response status is OK\n");

  return await response.json();
}

async function calculateRoundId(transaction: any) {
  const blockNumber = transaction.receipt.blockNumber;
  const block = await ethers.provider.getBlock(blockNumber);
  const blockTimestamp = BigInt(block!.timestamp);

  const flareSystemsManager: IFlareSystemsManagerInstance =
    await getFlareSystemsManager();
  const firsVotingRoundStartTs = BigInt(
    await flareSystemsManager.firstVotingRoundStartTs()
  );
  const votingEpochDurationSeconds = BigInt(
    await flareSystemsManager.votingEpochDurationSeconds()
  );

  console.log("Block timestamp:", blockTimestamp, "\n");
  console.log("First voting round start ts:", firsVotingRoundStartTs, "\n");
  console.log(
    "Voting epoch duration seconds:",
    votingEpochDurationSeconds,
    "\n"
  );

  const roundId = Number(
    (blockTimestamp - firsVotingRoundStartTs) / votingEpochDurationSeconds
  );
  console.log("Calculated round id:", roundId, "\n");
  console.log(
    "Received round id:",
    Number(await flareSystemsManager.getCurrentVotingEpochId()),
    "\n"
  );
  return roundId;
}

async function submitAttestationRequest(abiEncodedRequest: string) {
  const fdcHub = await getFdcHub();

  const requestFee = await getFdcRequestFee(abiEncodedRequest);

  const transaction = await fdcHub.requestAttestation(abiEncodedRequest, {
    value: requestFee,
  });
  console.log("Submitted request:", transaction.tx, "\n");

  const roundId = await calculateRoundId(transaction);
  console.log(
    `Check round progress at: https://${hre.network.name}-systems-explorer.flare.rocks/voting-epoch/${roundId}?tab=fdc\n`
  );
  return roundId;
}

async function postRequestToDALayer(
  url: string,
  request: any,
  watchStatus: boolean = false
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      //   "X-API-KEY": "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (watchStatus && response.status != 200) {
    throw new Error(
      `Response status is not OK, status ${response.status} ${response.statusText}\n`
    );
  } else if (watchStatus) {
    console.log("Response status is OK\n");
  }
  return await response.json();
}

async function retrieveDataAndProofBase(
  url: string,
  abiEncodedRequest: string,
  roundId: number
) {
  console.log("Waiting for the round to finalize...");
  // We check every 10 seconds if the round is finalized
  const relay: IRelayInstance = await getRelay();
  while (!(await relay.isFinalized(200, roundId))) {
    await sleep(30000);
  }
  console.log("Round finalized!\n");

  const request = {
    votingRoundId: roundId,
    requestBytes: abiEncodedRequest,
  };
  console.log("Prepared request:\n", request, "\n");

  await sleep(10000);
  var proof = await postRequestToDALayer(url, request, true);
  console.log("Waiting for the DA Layer to generate the proof...");
  while (proof.response_hex == undefined) {
    await sleep(10000);
    proof = await postRequestToDALayer(url, request, false);
  }
  console.log("Proof generated!\n");

  console.log("Proof:", proof, "\n");
  return proof;
}

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
