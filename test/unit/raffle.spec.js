const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { assert, expect } = require("chai")
const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Uint Tests", async function () {
          //set log level to ignore non errors
          ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR)

          async function deployRaffleFixture() {
              const [deployer] = await ethers.getSigners()
              const chainId = network.config.chainId

              const raffleFactory = await ethers.getContractFactory("Raffle")
              const { raffleEntranceFee } = networkConfig[chainId]
              const raffle = await raffleFactory.connect(deployer).deploy(raffleEntranceFee)

              return { raffle, raffleEntranceFee }
          }

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
              })
          })
      })
