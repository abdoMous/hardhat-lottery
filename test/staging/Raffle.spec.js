const { network, ethers, getNamedAccounts } = require("hardhat")
const { networkConfig, developmentChains } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const VRF_COORDINATOR_ABI = require("@chainlink/contracts/abi/v0.8/VRFCoordinatorV2.json")
const RAFFLE_ABI = require("../../build/artifacts/contracts/Raffle.sol/Raffle.json")
const LINK_TOKEN_ABI = require("@chainlink/contracts/abi/v0.4/LinkToken.json")

developmentChains.includes(network.name)
    ? describe.skep
    : describe("Raffle Staging Tests", async function () {
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              raffle = await ethers.getContractAt(
                  RAFFLE_ABI.abi,
                  "0x959C2736926f948c808CE050217F5c53686178a4",
                  deployer
              )
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink keepers and Chainlink VRF, we get a random winner", async function () {
                  console.log("Setting up test...")
                  const startingTimeStamp = await raffle.getLastTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      // setup listener before we enter the raffle
                      // Just in case the blockchain moves REALLY fast
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              console.log("recentWinner", recentWinner)
                              const raffleState = await raffle.getRaffleState()
                              console.log("raffleState", raffleState)
                              const winnerEndingBalance = await deployer.getBalance()
                              console.log("winnerEndingBalance", winnerEndingBalance)
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              console.log("endingTimeStamp", endingTimeStamp)

                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), deployer.address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          } 
                      })
                      // Then entering the raffle
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      const winnerStartingBalance = await deployer.getBalance()
                      console.log("winnerStartingBalance", winnerStartingBalance)

                      // and this code WONT complete until our listener has finished listening!
                  })
              })
          })
      })
