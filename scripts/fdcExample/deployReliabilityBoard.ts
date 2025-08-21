/* Title: 
 *      deployReliabilityBoard.ts
 * Description:
 *      Deploys the LinkedUpReliabilityBoard contract to the Coston2 network.
 *      Requires environment variables COSTON2_RPC_URL and PRIVATE_KEY to be set.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

import LinkedUpReliabilityBoardArtifact
    from "../../artifacts/contracts/fdcExample/LinkedUpReliabilityBoard.sol/LinkedUpReliabilityBoard.json";

async function main() {
    const { COSTON2_RPC_URL, PRIVATE_KEY } = process.env;

    if (!COSTON2_RPC_URL) {
        throw new Error("Missing COSTON2_RPC_URL in environment");
    }
    if (!PRIVATE_KEY) {
        throw new Error("Missing PRIVATE_KEY in environment");
    }

    // Sanity checks
    const provider = new ethers.JsonRpcProvider(COSTON2_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const [network, balance] = await Promise.all([
        provider.getNetwork(),
        provider.getBalance(wallet.address),
    ]);

    console.log("Network chainId:", network.chainId.toString());
    console.log("Deployer:", wallet.address);
    console.log("Balance (wei):", balance.toString());

    // Build factory and deploy the contract
    const abi = (LinkedUpReliabilityBoardArtifact as any).abi;
    const bytecode = (LinkedUpReliabilityBoardArtifact as any).bytecode;

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    console.log("Deploying LinkedUpReliabilityBoard…");
    const contract = await factory.deploy();
    const deployTx = contract.deploymentTransaction();
    console.log("Deployment tx hash:", deployTx?.hash);

    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log("Deployed at:", address);

    console.log("\nAdd the address to .env");
    console.log(`LINKEDUP_CONTRACT_ADDRESS=${address}\n`);
}

main().catch((e) => {
    console.error("Deploy failed:", e);
    process.exit(1);
});
