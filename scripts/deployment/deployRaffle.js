const { ethers, network, run } = require("hardhat")

const {
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    networkConfig,
} = require("../../helper-hardhat-config")

async function deployRaffle(chainId) {
    let VRFCoordinatorV2Mock
    let subscriptionId
    let vrfCoordinatorAddress

    if (chainId == 31337) {
        const BASE_FEE = "100000000000000000"
        const GAS_PRICE_LINK = "1000000000" // 0.000000001 LINK per gas

        const VRFCoordinatorV2MockFactory = await ethers.getContractFactory("VRFCoordinatorV2Mock")
        VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(BASE_FEE, GAS_PRICE_LINK)
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
    const arguments = [subscriptionId, vrfCoordinatorAddress, keyHash, raffleEntranceFee, interval]

    const raffle = await raffleFactory.deploy(...arguments)

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    await raffle.deployTransaction.wait(waitBlockConfirmations)

    console.log(`Raffle Contract deployed to ${raffle.address} on ${network.name}`)

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await run("verify:verify", {
            address: raffle.address,
            constructorArguments: arguments,
        })
    }

    if (chainId == 31337) {
        VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }
}

module.exports = {
    deployRaffle,
}
