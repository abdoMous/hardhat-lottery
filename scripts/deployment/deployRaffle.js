const { ethers, network, run } = require("hardhat")

const {
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    networkConfig,
} = require("../../helper-hardhat-config")

async function deployRaffle(chainId) {
    const raffleFactory = await ethers.getContractFactory("Raffle")

    const raffleEntranceFee = networkConfig[chainId]["raffleEntranceFee"]

    const raffle = await raffleFactory.deploy(raffleEntranceFee)

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    await raffle.deployTransaction.wait(waitBlockConfirmations)

    console.log(`Raffle Contract deployed to ${raffle.address} on ${network.name}`)

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await run("verify:verify", {
            address: raffle.address,
            constructorArguments: [raffleEntranceFee],
        })
    }
}

module.exports = {
    deployRaffle,
}
