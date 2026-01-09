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
    address walletAddress;
    bool checkedIn;
}

// User with cumulative reliability and attendance stats
struct LinkedUpUser {
    address walletAddress;
    int256 reliabilityScore;
    uint256 totalCheckIns;
    uint256 totalMisses;
}

interface ILinkedUpReliabilityBoard {
    function updateReliability(IJsonApi.Proof calldata proof) external;

    function getAllUsers() external view returns (LinkedUpUser[] memory);

    function getReliability(
        address walletAddress
    ) external view returns (int256);

    function getTotalCheckIns(
        address walletAddress
    ) external view returns (uint256);

    function getTotalMisses(
        address walletAddress
    ) external view returns (uint256);
}

contract LinkedUpReliabilityBoard is ILinkedUpReliabilityBoard {
    // Storage for user data
    mapping(address => LinkedUpUser) private users;
    address[] private userAddresses;

    // Configurable constants
    int256 public constant RELIABILITY_GAIN = 5;
    int256 public constant RELIABILITY_LOSS = -5;
    int256 public constant RELIABILITY_START = 50;

    /// Verifies the FDC attestation
    function isJsonApiProofValid(
        IJsonApi.Proof calldata _proof
    ) private view returns (bool) {
        return
            ContractRegistry.auxiliaryGetIJsonApiVerification().verifyJsonApi(
                _proof
            );
    }

    function getWeatherMultipliers(
        uint256 weatherCode
    ) public pure returns (uint256 checkInMultiplier, uint256 missMultiplier) {
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
    function updateReliability(
        IJsonApi.Proof calldata proof
    ) external override {
        require(isJsonApiProofValid(proof), "Invalid proof");

        ActivitySnapshot[] memory activities = abi.decode(
            proof.data.responseBody.abi_encoded_data,
            (ActivitySnapshot[])
        );

        for (uint256 i = 0; i < activities.length; i++) {
            ActivitySnapshot memory activity = activities[i];

            for (uint256 j = 0; j < activity.participants.length; j++) {
                Participant memory participant = activity.participants[j];

                if (!_userExists(participant.walletAddress)) {
                    userAddresses.push(participant.walletAddress);
                    users[participant.walletAddress] = LinkedUpUser({
                        walletAddress: participant.walletAddress,
                        reliabilityScore: RELIABILITY_START,
                        totalCheckIns: 0,
                        totalMisses: 0
                    });
                }

                (
                    uint256 gainMultiplier,
                    uint256 lossMultiplier
                ) = getWeatherMultipliers(activity.weatherCode);

                if (participant.checkedIn) {
                    int256 adjustedGain = (RELIABILITY_GAIN *
                        int256(gainMultiplier)) / 100;
                    users[participant.walletAddress].reliabilityScore += adjustedGain;
                    users[participant.walletAddress].totalCheckIns += 1;
                } else {
                    int256 adjustedLoss = (RELIABILITY_LOSS *
                        int256(lossMultiplier)) / 100;
                    users[participant.walletAddress].reliabilityScore += adjustedLoss;
                    users[participant.walletAddress].totalMisses += 1;
                }
            }
        }
    }

    /// Return all users with reliability
    function getAllUsers()
        public
        view
        override
        returns (LinkedUpUser[] memory)
    {
        LinkedUpUser[] memory result = new LinkedUpUser[](userAddresses.length);
        for (uint256 i = 0; i < userAddresses.length; i++) {
            result[i] = users[userAddresses[i]];
        }
        return result;
    }

    /// Look up one user's reliability
    function getReliability(
        address walletAddress
    ) public view override returns (int256) {
        return users[walletAddress].reliabilityScore;
    }

    /// Look up one user's total check ins
    function getTotalCheckIns(
        address walletAddress
    ) public view returns (uint256) {
        return users[walletAddress].totalCheckIns;
    }

    /// Look up one user's total misses
    function getTotalMisses(
        address walletAddress
    ) public view returns (uint256) {
        return users[walletAddress].totalMisses;
    }

    /// Internal existence check
    function _userExists(address walletAddress) internal view returns (bool) {
        if (userAddresses.length == 0) return false;
        // Check if the wallet address has been registered (non-zero address stored)
        return users[walletAddress].walletAddress != address(0);
    }
}
