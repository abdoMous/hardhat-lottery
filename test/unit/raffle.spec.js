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
              const [deployer] = await ethers.getSigners()
              const chainId = network.config.chainId

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
                  VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
              }

              return { raffle, raffleEntranceFee, chainId }
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
      })
