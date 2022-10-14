const fs = require("fs");
const { network } = require("hardhat");

module.exports = async () => {
  if (process.env.UPDATE_FRONTEND) {
    console.log("Writing to front end...");
    updateContractAddresses();
    updateAbi();
    console.log("Front end written!");
  }
};

const FRONTEND_ADDRESSES_FILE =
  "../hardhat-lottery-front/constants/contractAddresses.json";

const FRONTEND_ABI_FILE = "../hardhat-lottery-front/constants/abi.json";

async function updateAbi() {
  const raffle = await ethers.getContract("Raffle");
  fs.writeFileSync(
    FRONTEND_ABI_FILE,
    raffle.interface.format(ethers.utils.FormatTypes.json)
  );
}

async function updateContractAddresses() {
  const raffle = await ethers.getContract("Raffle");
  const contractAddresses = JSON.parse(
    fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf8")
  );
  if (network.config.chainId.toString() in contractAddresses) {
    if (
      !contractAddresses[network.config.chainId.toString()].includes(
        raffle.address
      )
    ) {
      contractAddresses[network.config.chainId.toString()].push(raffle.address);
    }
  } else {
    contractAddresses[network.config.chainId.toString()] = [raffle.address];
  }
  fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(contractAddresses));
}
module.exports.tags = ["all", "frontend"];
