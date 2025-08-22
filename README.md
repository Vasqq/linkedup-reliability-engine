# LinkedUp Reliability Engine

Welcome to the **LinkedUp Reliability Engine** repository

This project was developed for the **Flare x Encode Club Hackathon** and aims to provide a decentralized, verifiable system for tracking user reliability based on real-world activity check-ins. It showcases the innovative use of **Flare's FDC (Flare Data Connector)** protocols by bridging operational Web2 data (from a Flutter app backend) into verifiable Web3 reliability scores.

---

## About LinkedUp

LinkedUp is a mobile application (currently in development) designed to foster real-world social interaction through spontaneous and scheduled activities, particularly focused on sports. Users can:

View a map of nearby activities based on their location and interests.

Join ongoing or upcoming activities, or host their own.

Match based on interests, time availability, activity type, and participant limits.

Form groups, make friends, and build a network based on shared experiences.

Track reliability and participation over time.

Use cases currently include organizing pickup games for soccer, tennis, hiking, and other sports activities. Future expansions may allow for broader activities such as walking meetups, study sessions, picnics, and more.

While LinkedUp is not yet released publicly, its architecture emphasizes community building and real-world accountability.

The LinkedUp Reliability Engine in this repository extends the LinkedUp platform by **providing a decentralized, blockchain-verified method for tracking and rewarding user reliability**.

---

## Project Summary

### Problem:

Accountability and reliability are difficult to enforce in real-world social meetups. People often RSVP and then fail to attend, impacting the experience for others. Users have no easy way of knowing if the host or participants of an activity will actually show up, leading to wasted time and frustration.

### Solution:

The LinkedUp Reliability Engine introduces a decentralized, verifiable reliability score based on real-world attendance, creating a powerful incentive system. Users start with a baseline reliability score (50 points) that improves (+5) or deteriorates (-5) based on their attendance behavior. As users consistently attend activities they join or host, their score increases, signaling their reliability to others. Additionally, the weather conditions during the activity influence the magnitude of score changes: attending during adverse weather (e.g., thunderstorms) yields a greater positive impact, while missing activities under milder conditions results in a relatively larger penalty. This dynamic encourages commitment even under challenging circumstances.

When hosting an activity, a user's reliability score is publicly displayed to prospective participants. This allows participants to make informed decisions on whether to join, significantly increasing trust within the platform. Over time, higher reliability scores will become critical to building strong, dependable communities within LinkedUp.

Using attested activity check-in data from a Web2 database (Firestore), the system:

Prepares a verifiable attestation via Flare's Verifier API.

Posts this proof to the Flare blockchain (Coston2 testnet).

Updates user reliability scores on a custom smart contract.

The project is fully decentralized post-data publishing and offers a novel approach to bridging Web2 and Web3 user reliability systems.

> **Note:** LinkedUp (the mobile application) is still in development and has not yet been released. Live tests involving real users have been performed and are showcased in the video demo in the submission folder. 

This repository focuses solely on the backend reliability engine demonstration.

Access to the app's source code will be given on a request basis.

---

## Architecture Overview

```
LinkedUp App (private repo, separate)
  └── Firebase Firestore (activity check-in data)
         └── Firebase Cloud Functions (consolidates check-in data for the web2 api)
                └── Reliability Update Script (ReliabilityFdcProcessor.ts)
                        ├── Prepare Attestation (Flare Verifier API)
                        ├── Submit Proof (Flare FDC Contract)
                        └── Update Smart Contract (LinkedUpReliabilityBoard.sol)

```

The flow is fully automated:
- Every activity has a list of participants who checked-in on time
- Check-in data batches every 15 minutes.
- New snapshots are detected and processed.
- Proofs are verified and stored on-chain.
- Every users reliability score is updated based on their check-in data for the corresponding activity 
- Snapshots are marked as processed.

> Full diagrams and detailed code walkthrough are available inside the repository.

---

## Key Technologies Used

- **Flare Network** (Coston2 testnet)
- **Flare FDC Protocols** (prepareRequest, submitAttestation, retrieveProof)
- **Hardhat** (EVM development framework)
- **Firebase** (Firestore database + Cloud Functions)
- **Node.js** (Trigger server + processing scripts)
- **Solidity** (LinkedUpReliabilityBoard smart contract)

---

## Smart Contract - LinkedUpReliabilityBoard.sol

**Features:**
- On-chain storage of user reliability scores.
- Weather multipliers to reward check-ins under harsh conditions.
- Track total check-ins and misses for each user.
- Provide public views for reliability queries.

**Core Functions:**
- `updateReliability(proof)` — verifies and ingests attested data.
- `getreliability(uuid)` — fetches a user's current reliability score.

---

## 📂 Repository Structure

```
/scripts/fdcExample/ReliabilityFdcProcessor.ts  ➔ Main script orchestrating the full flow
/scripts/fdcExample/Base.ts                     ➔ Shared helper functions provided by Flare
/contracts/LinkedUpReliabilityBoard.sol         ➔ Smart contract source code
```

---

## How to Observe System in Action

This project operates using an internal, privately-hosted Firebase backend and a local server managed by the LinkedUp team.

Although public users cannot run the system locally, you can observe the on-chain updates in real-time by monitoring the smart contract activity.

Where to check:

Coston2 Testnet Explorer: Track reliability updates at Coston2 Explorer

Contract Address: 0x0xBE8BEAab49cdb09892D1d60864cE32190EA6d6D4

Transaction logs will reflect users' check-ins and the associated reliability updates processed by the Reliability Engine.

Note: Full control and execution of the Reliability Engine scripts remain internal for demonstration and validation purposes.

---

## Disclosures

- The **LinkedUp app** and its operational infrastructure are **private intellectual property**. This repository only includes the reliability engine and smart contract components.
- No real-world users have been onboarded yet; the system has been tested in **isolated development environments**.
- Testnet deployments only (Coston2). No mainnet interactions.
- Access to the private LinkedUp repo has been given temporarily to the judges during the Encode Club Incubator

---

## Contributors

- **afpaz** — Developer
- **vasqq** — Developer
---

## Future Work

## Future Work  

- **Expand reliability model:** Move beyond attendance to include other signals of reliability (e.g. hosting consistency, cancellations, timeliness), blending on-chain and off-chain behaviors.  
- **In-app reliability display:** Surface host and participant reliability scores directly in the LinkedUp app before users decide to join, strengthening trust and decision-making.  
- **Granular updates (vs batching):** Transition from batching snapshots into processing activity check-ins individually, leveraging FDC’s ability to attest per-activity data.  
- **Resilience improvements:** Add proof caching and retries to handle DA Layer delays, ensuring idempotent and reliable pipeline execution.  
- **Reward layer:** Introduce $FLR payouts to high-reliability users (especially hosts) to incentivize dependable community building and bootstrap mainstream Web3 adoption.  
- **LinkedUp Token (LKUP):** Launch a native LinkedUp token to power reliability incentives and governance. This token would serve as the backbone for on-chain participation, rewards, and long-term ecosystem sustainability.  
- **Staking for activity reservations:** Require participants to stake LKUP tokens (or $FLR) to reserve their spot in an activity.  
  - If they attend → tokens are returned.  
  - If they don’t show up → staked tokens are automatically transferred to the host or community pool as a penalty.  
  - This creates real accountability and ensures commitment to activities.  
- **Production deployment:** Move from Coston2 to Flare mainnet once JSON API attestation is supported, with monitoring and structured rollout.  
- **Scale to thousands:** Stress-test contract design and Firebase → FDC → contract pipeline to support thousands of users and activities across multiple cities.  


---

## Feedback on Building with Flare

The FDC was straightforward to integrate and very developer-friendly.

The Encode Club/ Flare tutorials were verusy useful

Having access to a JQ-based Verifier API made preparing attestations feel flexible and powerful.

The Coston2 testnet provided a reliable environment for testing my smart contract.

---

## Submission Details

Repository Link: [LinkedUp Reliability Engine GitHub](https://github.com/Vasqq/linkedup-reliability-engine)

Deployed Contract Address:
0x0xBE8BEAab49cdb09892D1d60864cE32190EA6d6D4

Demo Transaction Hash:
0x686ef396cfd9c649408da0dee92b9de910c94390bd2207bab0bd415c2c64869a

The demo transaction reflects an on-chain reliability update for two users after participating in an activity.

---

## Final Notes

The LinkedUp Reliability Engine demonstrates a **novel Web2 to Web3 bridge** for event-based reliability management. By leveraging Flare's infrastructure, it opens a path for decentralized trust models grounded in real-world actions.

We believe this project showcases the potential of Flare FDC and highlights the innovation possible when bridging traditional mobile apps with decentralized verification systems.

Thank you for reviewing our submission!