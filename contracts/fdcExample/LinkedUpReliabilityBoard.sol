// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IJsonApi} from "@flarenetwork/flare-periphery-contracts/coston2/IJsonApi.sol";

// Struct representing an attested activity snapshot
struct ActivitySnapshot {
    string activityId;
    uint256 weatherCode;
    Participant[] participants;
}

// A participant's attendance record
struct Participant {
    string uuid;
    bool checkedIn;
}

// User with cumulative reputation and attendance stats
struct LinkedUpUser {
    string uuid;
    int256 reputationScore;
    uint256 totalCheckIns;
    uint256 totalMisses;
}

interface ILinkedUpReputationBoard {
    function updateReputation(IJsonApi.Proof calldata proof) external;
    function getAllUsers() external view returns (LinkedUpUser[] memory);
    function getReputation(string calldata uuid) external view returns (int256);
}

contract LinkedUpReputationBoard is ILinkedUpReputationBoard {
    // Storage for user data
    mapping(string => LinkedUpUser) private users;
    string[] private userUuids;

    // Configurable constants
    int256 public constant REPUTATION_GAIN = 5;
    int256 public constant REPUTATION_LOSS = -5;
    int256 public constant REPUTATION_START = 50;

    /// Verifies the FDC attestation
    function isJsonApiProofValid(IJsonApi.Proof calldata _proof) private view returns (bool) {
        return ContractRegistry.auxiliaryGetIJsonApiVerification().verifyJsonApi(_proof);
    }

    function getWeatherMultipliers(uint256 weatherCode) public pure returns (uint256 checkInMultiplier, uint256 missMultiplier) {
    if (weatherCode >= 200 && weatherCode < 300) {
            return (120, 80); // Thunderstorm: +20%, -20%
        } else if (weatherCode == 802) {
            return (110, 90); // Scattered clouds: +10%, -10%
        } else if (weatherCode == 800) {
            return (100, 100); // Clear: neutral
        } else {
            return (100, 100); // Default: neutral
        }
    }


    /// Ingest and process FDC-attested participant check-in snapshot
   function updateReputation(IJsonApi.Proof calldata proof) external override{
    require(isJsonApiProofValid(proof), "Invalid proof");

    ActivitySnapshot[] memory activities = abi.decode(
        proof.data.responseBody.abi_encoded_data,
        (ActivitySnapshot[])
    );

    for (uint256 i = 0; i < activities.length; i++) {
        ActivitySnapshot memory activity = activities[i];


        for (uint256 j = 0; j < activity.participants.length; j++) {
            Participant memory participant = activity.participants[j];

            if (!_userExists(participant.uuid)) {
                userUuids.push(participant.uuid);
                users[participant.uuid] = LinkedUpUser({
                    uuid: participant.uuid,
                    reputationScore: REPUTATION_START,
                    totalCheckIns: 0,
                    totalMisses: 0
                });
            }

            (uint256 gainMultiplier, uint256 lossMultiplier) = getWeatherMultipliers(activity.weatherCode);

            if (participant.checkedIn) {
                int256 adjustedGain = (REPUTATION_GAIN * int256(gainMultiplier)) / 100;
                users[participant.uuid].reputationScore += adjustedGain;
                users[participant.uuid].totalCheckIns += 1;
            } else {
                int256 adjustedLoss = (REPUTATION_LOSS * int256(lossMultiplier)) / 100;
                users[participant.uuid].reputationScore += adjustedLoss;
                users[participant.uuid].totalMisses += 1;
            }

        }
    }
}


    /// Return all users with reputation
    function getAllUsers() public view override returns (LinkedUpUser[] memory) {
        LinkedUpUser[] memory result = new LinkedUpUser[](userUuids.length);
        for (uint256 i = 0; i < userUuids.length; i++) {
            result[i] = users[userUuids[i]];
        }
        return result;
    }

    /// Look up one user’s reputation
    function getReputation(string calldata uuid) public view override returns (int256) {
        return users[uuid].reputationScore;
    }

    /// Internal existence check
    function _userExists(string memory uuid) internal view returns (bool) {
        if (userUuids.length == 0) return false;
        bytes memory check = bytes(users[uuid].uuid);
        return check.length > 0;
    }
}
