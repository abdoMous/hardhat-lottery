const { AlchemyWebSocketProvider } = require("@ethersproject/providers")
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { assert, expect } = require("chai")
const { network, ethers } = require("hardhat")
const { int } = require("hardhat/internal/core/params/argumentTypes")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Uint Tests", async function () {
          //set log level to ignore non errors
          ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR)

          async function deployRaffleFixture() {
              const [deployer, player1, player2] = await ethers.getSigners()
              const chainId = network.config.chainId
              let VRFCoordinatorV2Mock

              if (chainId == 31337) {
                  const BASE_FEE = "100000000000000000"
                  const GAS_PRICE_LINK = "1000000000" // 0.000000001 LINK per gas

                  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory(
                      "VRFCoordinatorV2Mock"
                  )
                  VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(
                      BASE_FEE,
                      GAS_PRICE_LINK
                  )
                  vrfCoordinatorAddress = VRFCoordinatorV2Mock.address
                  const fundAmount = networkConfig[chainId]["fundAmount"] || "1000000000000000000"
                  const transaction = await VRFCoordinatorV2Mock.createSubscription()
                  const transactionReceipt = await transaction.wait(1)
                  subscriptionId = ethers.BigNumber.from(transactionReceipt.events[0].topics[1])
                  await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, fundAmount)
              } else {
                  subscriptionId = networkConfig[chainId]["subscriptionId"]
                  vrfCoordinatorAddress = networkConfig[chainId]["vrfCoordinator"]
              }

              const { raffleEntranceFee, keyHash, interval } = networkConfig[chainId]

              const raffleFactory = await ethers.getContractFactory("Raffle")
              const arguments = [
                  subscriptionId,
                  vrfCoordinatorAddress,
                  keyHash,
                  raffleEntranceFee,
                  interval,
              ]

              const raffle = await raffleFactory.deploy(...arguments)

              if (chainId == 31337) {
                  await VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
              }

              return {
                  raffle,
                  raffleEntranceFee,
                  chainId,
                  interval,
                  VRFCoordinatorV2Mock,
                  deployer,
                  player1,
                  player2,
              }
          }

          describe("constructor", async function () {
              it("initialize the raffle correctly", async function () {
                  const { raffle, chainId } = await loadFixture(deployRaffleFixture)
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  const entranceFee = await raffle.getEntranceFee()

                  assert.equal(raffleState.toString(), "0", "not initialize raffle state correctly")
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"],
                      "not initialize raffle interval correctly"
                  )
                  assert.equal(
                      entranceFee.toString(),
                      networkConfig[chainId]["raffleEntranceFee"],
                      "not initialize raffle intrance fee correctly"
                  )
              })
          })

          describe("#enterRaffle", async function () {
              describe("success", async function () {
                  it("should add a player to raffle", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      const transaction = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await transaction.wait(1)
                      const numberOfPlayers = await raffle.getNumberOfPlayers()
                      assert.notEqual(numberOfPlayers, 0, "No player entred")
                  })
                  it("emits an event on enter", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                          raffle,
                          "RaffleEnter"
                      )
                  })
              })
              describe("failure", async function () {
                  it("reverts when you don't pay enouph", async function () {
                      const { raffle } = await loadFixture(deployRaffleFixture)
                      await expect(raffle.enterRaffle({ value: 0 })).to.be.revertedWithCustomError(
                          raffle,
                          "Raffle__SendMoreToEnterRaffle"
                      )
                  })
                  it("doesn't allow entrance when raffle is calculating", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      const interval = await raffle.getInterval()
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      // pretending to be a keeper
                      await raffle.performUpkeep([])
                      await expect(
                          raffle.enterRaffle({ value: raffleEntranceFee })
                      ).to.be.revertedWithCustomError(
                          raffle,
                          "Raffle__RaffleNotOpen",
                          "did not reverts when entre the raffle when it calculating"
                      )
                  })
              })
          })
          describe("#checkUpkeep", async function () {
              describe("success", async function () {
                  it("returns false if people haven't sent any ETH", async function () {
                      const { raffle } = await loadFixture(deployRaffleFixture)
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                      assert(!upkeepNeeded)
                  })
                  it("returns false if raffle isn't open", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      await raffle.performUpkeep([]) // change the state to : CALCULATING
                      const raffleState = await raffle.getRaffleState()

                      assert.isTrue(raffleState.toString() == "1")

                      const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                      assert.isNotTrue(upkeepNeeded)
                  })
                  it("returns false if not enouph time passed", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() - 5])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                      assert.isNotTrue(upkeepNeeded)
                  })
                  it("returns true if enought time has passed, has player, eth, and its open", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                      assert.isTrue(upkeepNeeded)
                  })
              })
          })
          describe("#performUpkeep", async function () {
              describe("success", async function () {
                  it("can only run if checkupkeep is true", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const transaction = await raffle.performUpkeep([])
                      const { upkeepNeeded } = raffle.checkUpkeep("0x")
                      assert(transaction, upkeepNeeded)
                  })
                  it("updates the raffle state and emits a requestId", async function () {
                      const { raffle, raffleEntranceFee } = await loadFixture(deployRaffleFixture)
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const interval = await raffle.getInterval()
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      await expect(raffle.performUpkeep([])).to.emit(
                          raffle,
                          "RequestedRaffleWinner"
                      )

                      const raffleState = await raffle.getRaffleState()
                      assert(raffleState.toString() == "1")
                  })
              })
              describe("failure", async function () {
                  it("reverts if checkup is false", async function () {
                      const { raffle } = await loadFixture(deployRaffleFixture)
                      const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                      assert(!upkeepNeeded)

                      expect(raffle.performUpkeep([])).to.be.revertedWithCustomError(
                          raffle,
                          "Raffle__UpkeepNotNeeded"
                      )
                  })
              })
          })
          describe("#fulfillRandomWords", async function () {
              it("can only be called after performupkeep", async function () {
                  const { raffle, raffleEntranceFee, VRFCoordinatorV2Mock } = await loadFixture(
                      deployRaffleFixture
                  )
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const interval = await raffle.getInterval()
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
              })

              it("pick a winner, resets, and sends mony", async function () {
                  const {
                      raffle,
                      raffleEntranceFee,
                      deployer,
                      player1,
                      player2,
                      VRFCoordinatorV2Mock,
                  } = await loadFixture(deployRaffleFixture)

                  const entranceFee = raffle.getEntranceFee()

                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await raffle.connect(player1).enterRaffle({ value: raffleEntranceFee })
                  await raffle.connect(player2).enterRaffle({ value: raffleEntranceFee })

                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  const interval = await raffle.getInterval()
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  await new Promise(async function (resolve, reject) {
                      raffle.once("WinnerPicked", async function () {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await player2.getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), player2.address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance
                                      .add(raffleEntranceFee)
                                      .add(raffleEntranceFee)
                                      .add(raffleEntranceFee)
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      const transaction = await raffle.performUpkeep("0x")
                      const transactionReceipt = await transaction.wait(1)
                      const startingBalance = await player2.getBalance()
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          transactionReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
