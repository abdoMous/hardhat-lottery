/* eslint-disable no-process-exit */
// yarn hardhat node
// yarn hardhat run scripts/mockOffchain.js --network localhost
const { network, ethers, deployments } = require("hardhat")
const RAFFLE_ABI = require("../build/artifacts/contracts/Raffle.sol/Raffle.json")
const VRF_COORDINATOR_ABI = require("@chainlink/contracts/abi/v0.8/VRFCoordinatorV2.json")

async function mockKeepers() {
    const deployer = await ethers.getSigners()[0]
    const raffleFactory = await ethers.getContractFactory("Raffle")
    const raffle = raffleFactory.attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9")

    const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""))
    const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(checkData)
    if (upkeepNeeded) {
        const tx = await raffle.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.events[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(requestId, raffle)
        }
    } else {
        console.log("No upkeep needed!")
    }
}

async function mockVrf(requestId, raffle) {
    console.log("We on a local network? Ok let's pretend...")
    const vrfCoordinatorV2MockFactory = await ethers.getContractFactory("VRFCoordinatorV2Mock")
    const vrfCoordinatorV2Mock = vrfCoordinatorV2MockFactory.attach(
        "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    )
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.address)
    console.log("Responded!")
    const recentWinner = await raffle.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
