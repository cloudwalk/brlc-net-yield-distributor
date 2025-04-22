import { ethers, upgrades } from "hardhat";

async function main() {
  const CONTRACT_NAME: string = ""; // TBD: Enter contract name
  const UNDERLYING_TOKEN: string = ""; // TBD: Enter underlying token address

  const factory = await ethers.getContractFactory(CONTRACT_NAME);
  const proxy = await upgrades.deployProxy(
    factory,
    [UNDERLYING_TOKEN],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();

  console.log("Proxy deployed:", await proxy.getAddress());
}

main().then().catch(err => {
  throw err;
});
