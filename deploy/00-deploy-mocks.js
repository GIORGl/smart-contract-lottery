const { network } = require("hardhat");
const { ethers } = require("ethers");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // fee per request in LINK to rinkeby to use this VRFCOORDINATORV2MOCK contract
const GAS_PRICE_LINK = 1e9;

module.exports = async ({ getNamedAccounts, deploymets }) => {
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  //   const chainId = network.config.chainId;

  if (developmentChains.includes(network.name)) {
    log("Local network detected deploying mocks...");
    //deploy a mock vrfcoordinator

    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: [BASE_FEE, GAS_PRICE_LINK],
    });
    log("Mocks Deployed!");

    log("_______________________________");
  }
};

module.exports.tags = ["all", "mocks"];
