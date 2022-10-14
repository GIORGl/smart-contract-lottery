const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  isCallTrace,
} = require("hardhat/internal/hardhat-network/stack-traces/message-trace");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", async function () {
      let raffle,
        vrfCoordinatorV2Mock,
        chainId,
        raffleEntranceFee,
        deployer,
        accounts,
        interval;

      chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;

        accounts = await ethers.getSigners();
        await deployments.fixture(["all"]);

        raffle = await ethers.getContract("Raffle", deployer);

        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );

        raffleEntranceFee = await raffle.getEntranceFee();
      });

      describe("constructor", async function () {
        it("initializes the raffle correctly!", async function () {
          const raffleState = await raffle.getRaffleState();

          interval = await raffle.getInterval();

          assert.equal(
            interval.toString(),
            networkConfig[chainId]["keepersUpdateInterval"]
          );
          assert.equal(raffleState.toString(), "0");
        });
      });

      describe("enterRaffle", async function () {
        it("reverts when you do not pay enough!", async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughETHEntered"
          );
        });

        it("should record players when they enter!", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });

          const playerFromContract = await raffle.getPlayer(0);

          assert.equal(playerFromContract, deployer);
        });

        it("should emit an event", async function () {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, "RaffleEnter");
        });

        it("doesn't allow entrance when raffle is calculating", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });

          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);

          await network.provider.send("evm_mine", []);

          await raffle.performUpkeep([]);

          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.be.revertedWith("Raffle__NOTOpen");
        });

        describe("checkUpKeep", async function () {
          it("return false if people havent sent any eth", async function () {
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);

            await network.provider.send("evm_mine", []);

            const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([]);

            assert(!upKeepNeeded);
          });

          it("returns false if raffle isn't open", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            await raffle.performUpkeep([]);
            const raffleState = await raffle.getRaffleState();
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
            assert.equal(raffleState.toString() == "1", upkeepNeeded == false);
          });

          it("returns false if enough time hasn't passed", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() - 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
            assert(!upkeepNeeded);
          });
          it("returns true if enough time has passed, has players, eth, and is open", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
            assert(upkeepNeeded);
          });
        });

        describe("performUpkeep", function () {
          it("can only run if checkUpKeep is true", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const tx = await raffle.performUpkeep([]);

            assert(tx);
          });

          it("reverts when checkUpkeep is false", async function () {
            await expect(raffle.performUpkeep([])).to.be.revertedWith(
              "Raffle__UpkeepNotNeeded"
            );
          });
          it("updates the raffle state , emits an event, and calls a vrf coordinator", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const txResponse = await raffle.performUpkeep([]);

            const txReceipt = await txResponse.wait(1);

            const requestId = txReceipt.events[1].args.requestId;

            const raffleState = await raffle.getRaffleState();

            assert(requestId.toNumber() > 0);
            assert(raffleState.toString() == "1");
          });
        });

        describe("fulfillRandomWords", function () {
          beforeEach(async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
          });

          it("can only be called after performupkeep", async () => {
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
            ).to.be.revertedWith("nonexistent request");
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
            ).to.be.revertedWith("nonexistent request");
          });

          it("picks a winner, resets, and sends money", async () => {
            const additionalEntrances = 3;
            const startingIndex = 1;
            for (
              let i = startingIndex;
              i < startingIndex + additionalEntrances;
              i++
            ) {
              // i = 2; i < 5; i=i+1
              const accountConnectedRaffle = raffle.connect(accounts[i]);
              await accountConnectedRaffle.enterRaffle({
                value: raffleEntranceFee,
              });
            }
            const startingTimeStamp = await raffle.getLatestTimeStamp();

            await new Promise(async (resolve, reject) => {
              raffle.once("WinnerPicked", async () => {
                try {
                  const recentWinner = await raffle.getRecentWinner();
                  const raffleState = await raffle.getRaffleState();
                  const winnerBalance = await accounts[2].getBalance();
                  const endingTimeStamp = await raffle.getLatestTimeStamp();
                  await expect(raffle.getPlayer(0)).to.be.reverted;
                  assert.equal(recentWinner.toString(), accounts[1].address);
                  assert.equal(raffleState, 0);
                  assert.equal(
                    winnerBalance.toString(),
                    startingBalance
                      .add(
                        raffleEntranceFee
                          .mul(additionalEntrances)
                          .add(raffleEntranceFee)
                      )
                      .toString()
                  );
                  assert(endingTimeStamp > startingTimeStamp);
                  resolve();
                } catch (error) {
                  reject(error);
                }
                resolve();
              });

              const tx = await raffle.performUpkeep("0x");
              const txReceipt = await tx.wait(1);
              const startingBalance = await accounts[1].getBalance();
              await vrfCoordinatorV2Mock.fulfillRandomWords(
                txReceipt.events[1].args.requestId,
                raffle.address
              );
            });
          });
        });
      });
    });
