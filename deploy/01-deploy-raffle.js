const {
  developmentChains,
  networkConfig,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");
const { network, ethers } = require("hardhat");
const { CloudflareProvider } = require("@ethersproject/providers");

const VRF_COORDINATOR_SUB_AMOUNT = ethers.utils.parseEther("30");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const chainId = network.config.chainId;
  const { deployer } = await getNamedAccounts();
  let vrfCoordinatorV2Address, subscriptionId;

  if (developmentChains.includes(network.name)) {
    const VRFCOORDINATORV2MOCK = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );

    console.log(VRFCOORDINATORV2MOCK.address);
    VRFCoordinatorV2Address = VRFCOORDINATORV2MOCK.address;

    console.log("check here -- - - - - -", VRFCoordinatorV2Address);

    const transactionResponse = await VRFCOORDINATORV2MOCK.createSubscription();

    const transactionReceipt = await transactionResponse.wait(1);
    subscriptionId = transactionReceipt.events[0].args.subId;

    await VRFCOORDINATORV2MOCK.fundSubscription(
      subscriptionId,
      VRF_COORDINATOR_SUB_AMOUNT
    );
  } else {
    VRFCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  networkConfig[chainId]["keepersUpdateInterval"];

  const args = [
    VRFCoordinatorV2Address,
    networkConfig[chainId]["raffleEntranceFee"],
    networkConfig[chainId]["gasLane"],
    subscriptionId,
    networkConfig[chainId]["callbackGasLimit"],
    networkConfig[chainId]["keepersUpdateInterval"],
  ];

  const raffle = await deploy("Raffle", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_KEY) {
    log("Verifying...");
    await verify(raffle.address, args);
  }

  log("________________________________");
};

module.exports.tags = ["all", "raffle"];

//keepersUpdateInterval
